import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import Stripe from 'stripe'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../../../../convex/_generated/api'
import {
  getStripeClient,
  getStripeWebhookSecret,
  isPaymentsEnabled,
  mapSubscriptionStatusToTier,
} from '@/lib/stripe'
import type { Id } from '../../../../../convex/_generated/dataModel'

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

/**
 * Stripe Webhook Handler
 *
 * Handles incoming webhooks from Stripe for:
 * - checkout.session.completed - New subscription created
 * - customer.subscription.created - Subscription created
 * - customer.subscription.updated - Subscription status changed
 * - customer.subscription.deleted - Subscription canceled
 * - invoice.payment_succeeded - Payment successful
 * - invoice.payment_failed - Payment failed
 */
export async function POST(request: Request) {
  // Check if payments are enabled
  if (!isPaymentsEnabled()) {
    return NextResponse.json(
      { error: 'Payment system is disabled' },
      { status: 503 }
    )
  }

  const stripe = getStripeClient()
  const webhookSecret = getStripeWebhookSecret()

  if (!stripe || !webhookSecret) {
    console.error('Stripe is not properly configured')
    return NextResponse.json(
      { error: 'Payment system is not configured' },
      { status: 503 }
    )
  }

  // Get the raw body and signature
  const body = await request.text()
  const headersList = await headers()
  const signature = headersList.get('stripe-signature')

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    )
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Webhook signature verification failed:', message)
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 }
    )
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session)
        break

      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription)
        break

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
        break

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice)
        break

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice)
        break

      default:
        // Unhandled event type - log but don't error
        console.log(`Unhandled Stripe event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Error processing webhook:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  }
}

/**
 * Handle checkout.session.completed event
 * This is fired when a customer completes the checkout flow
 */
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  // Extract organization ID from metadata
  const organizationId = session.metadata?.organizationId
  const userId = session.metadata?.userId

  if (!organizationId || !userId) {
    console.error('Missing metadata in checkout session:', session.id)
    return
  }

  const customerId = session.customer as string
  const customerEmail = session.customer_email || session.customer_details?.email

  if (!customerId || !customerEmail) {
    console.error('Missing customer data in checkout session:', session.id)
    return
  }

  // Create/update Stripe customer mapping
  await convex.mutation(api.subscriptions.upsertStripeCustomer, {
    organizationId: organizationId as Id<'organizations'>,
    stripeCustomerId: customerId,
    email: customerEmail,
  })

  console.log(`Checkout completed for organization ${organizationId}`)
}

/**
 * Handle customer.subscription.created event
 */
async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string

  // Get organization from Stripe customer mapping
  const stripeCustomer = await convex.query(api.subscriptions.getStripeCustomerById, {
    stripeCustomerId: customerId,
  })

  if (!stripeCustomer) {
    console.error('No organization found for Stripe customer:', customerId)
    return
  }

  const subscriptionItem = subscription.items.data[0]
  const priceId = subscriptionItem?.price.id

  if (!priceId || !subscriptionItem) {
    console.error('No price found in subscription:', subscription.id)
    return
  }

  // Create subscription record
  // Note: In Stripe SDK v20+, period fields are on subscription items
  await convex.mutation(api.subscriptions.createSubscription, {
    organizationId: stripeCustomer.organizationId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    stripePriceId: priceId,
    status: subscription.status,
    currentPeriodStart: subscriptionItem.current_period_start * 1000,
    currentPeriodEnd: subscriptionItem.current_period_end * 1000,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    cancelAt: subscription.cancel_at ? subscription.cancel_at * 1000 : undefined,
    trialStart: subscription.trial_start ? subscription.trial_start * 1000 : undefined,
    trialEnd: subscription.trial_end ? subscription.trial_end * 1000 : undefined,
  })

  // Update organization tier based on subscription status
  const newTier = mapSubscriptionStatusToTier(subscription.status)

  // Get admin user for the organization (for audit log)
  const org = await convex.query(api.organizations.getById, {
    organizationId: stripeCustomer.organizationId,
  })

  if (org) {
    await convex.mutation(api.subscriptions.syncOrganizationTier, {
      organizationId: stripeCustomer.organizationId,
      tier: newTier,
      userId: org.createdBy,
      action: 'billing.subscription_created',
      details: JSON.stringify({
        subscriptionId: subscription.id,
        status: subscription.status,
        priceId,
      }),
    })
  }

  console.log(`Subscription created for organization ${stripeCustomer.organizationId}`)
}

/**
 * Handle customer.subscription.updated event
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const existingSubscription = await convex.query(api.subscriptions.getByStripeSubscriptionId, {
    stripeSubscriptionId: subscription.id,
  })

  if (!existingSubscription) {
    // Subscription doesn't exist yet, this might be the first update after creation
    // Try to handle it as a new subscription
    await handleSubscriptionCreated(subscription)
    return
  }

  const previousStatus = existingSubscription.status
  const newStatus = subscription.status
  const subscriptionItem = subscription.items.data[0]

  // Update subscription record
  await convex.mutation(api.subscriptions.updateSubscription, {
    stripeSubscriptionId: subscription.id,
    status: newStatus,
    currentPeriodStart: subscriptionItem ? subscriptionItem.current_period_start * 1000 : undefined,
    currentPeriodEnd: subscriptionItem ? subscriptionItem.current_period_end * 1000 : undefined,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    cancelAt: subscription.cancel_at ? subscription.cancel_at * 1000 : undefined,
    trialEnd: subscription.trial_end ? subscription.trial_end * 1000 : undefined,
  })

  // Check if status changed in a way that affects tier
  const previousTier = mapSubscriptionStatusToTier(previousStatus)
  const newTier = mapSubscriptionStatusToTier(newStatus)

  if (previousTier !== newTier) {
    // Get admin user for the organization
    const org = await convex.query(api.organizations.getById, {
      organizationId: existingSubscription.organizationId,
    })

    if (org) {
      const action = newTier === 'pro' ? 'billing.tier_upgraded' : 'billing.tier_downgraded'

      await convex.mutation(api.subscriptions.syncOrganizationTier, {
        organizationId: existingSubscription.organizationId,
        tier: newTier,
        userId: org.createdBy,
        action,
        details: JSON.stringify({
          subscriptionId: subscription.id,
          previousStatus,
          newStatus,
        }),
      })
    }
  }

  console.log(`Subscription updated: ${subscription.id}`)
}

/**
 * Handle customer.subscription.deleted event
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const existingSubscription = await convex.query(api.subscriptions.getByStripeSubscriptionId, {
    stripeSubscriptionId: subscription.id,
  })

  if (!existingSubscription) {
    console.log('Subscription not found for deletion:', subscription.id)
    return
  }

  // Update subscription status to canceled
  await convex.mutation(api.subscriptions.updateSubscription, {
    stripeSubscriptionId: subscription.id,
    status: 'canceled',
    cancelAtPeriodEnd: false,
  })

  // Downgrade organization to free tier
  const org = await convex.query(api.organizations.getById, {
    organizationId: existingSubscription.organizationId,
  })

  if (org) {
    await convex.mutation(api.subscriptions.syncOrganizationTier, {
      organizationId: existingSubscription.organizationId,
      tier: 'free',
      userId: org.createdBy,
      action: 'billing.subscription_canceled',
      details: JSON.stringify({
        subscriptionId: subscription.id,
        reason: 'subscription_deleted',
      }),
    })
  }

  console.log(`Subscription deleted: ${subscription.id}`)
}

/**
 * Get subscription ID from invoice (handles Stripe SDK v20+ structure)
 */
function getSubscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  // In Stripe SDK v20+, subscription is in parent.subscription_details
  if (invoice.parent?.subscription_details) {
    const sub = invoice.parent.subscription_details.subscription
    return typeof sub === 'string' ? sub : sub?.id || null
  }
  return null
}

/**
 * Handle invoice.payment_succeeded event
 */
async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const subscriptionId = getSubscriptionIdFromInvoice(invoice)

  if (!subscriptionId) {
    // Not a subscription-related invoice
    return
  }

  const subscription = await convex.query(api.subscriptions.getByStripeSubscriptionId, {
    stripeSubscriptionId: subscriptionId,
  })

  if (!subscription) {
    console.log('Subscription not found for payment:', subscriptionId)
    return
  }

  // Get admin user for audit log
  const org = await convex.query(api.organizations.getById, {
    organizationId: subscription.organizationId,
  })

  if (org) {
    await convex.mutation(api.subscriptions.logBillingEvent, {
      organizationId: subscription.organizationId,
      userId: org.createdBy,
      action: 'billing.payment_succeeded',
      details: JSON.stringify({
        invoiceId: invoice.id,
        amount: invoice.amount_paid,
        currency: invoice.currency,
      }),
    })
  }

  console.log(`Payment succeeded for subscription: ${subscriptionId}`)
}

/**
 * Handle invoice.payment_failed event
 */
async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = getSubscriptionIdFromInvoice(invoice)

  if (!subscriptionId) {
    return
  }

  const subscription = await convex.query(api.subscriptions.getByStripeSubscriptionId, {
    stripeSubscriptionId: subscriptionId,
  })

  if (!subscription) {
    console.log('Subscription not found for failed payment:', subscriptionId)
    return
  }

  // Get admin user for audit log
  const org = await convex.query(api.organizations.getById, {
    organizationId: subscription.organizationId,
  })

  if (org) {
    await convex.mutation(api.subscriptions.logBillingEvent, {
      organizationId: subscription.organizationId,
      userId: org.createdBy,
      action: 'billing.payment_failed',
      details: JSON.stringify({
        invoiceId: invoice.id,
        amount: invoice.amount_due,
        currency: invoice.currency,
        attemptCount: invoice.attempt_count,
      }),
    })
  }

  console.log(`Payment failed for subscription: ${subscriptionId}`)
}
