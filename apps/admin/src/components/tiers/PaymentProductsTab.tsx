import { useState } from "react";
import { useAdminQuery, useAdminMutation } from "@/hooks/useAdminQuery";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { Spinner } from "@/components/ui/Spinner";
import { Drawer } from "@/components/ui/Drawer";
import { QueryState } from "@/components/ui/QueryState";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { toast } from "@/components/ui/Toast";
import { useConfirmStore } from "@/stores/confirm-store";
import { Plus, Pencil, Trash2, RotateCcw } from "lucide-react";

interface ProductRow extends Record<string, unknown> {
  _id: Id<"paymentProducts">;
  tierName: string;
  provider: string;
  productId: string;
  label?: string;
  isActive: boolean;
}

export function PaymentProductsTab() {
  const paymentProducts = useAdminQuery(
    api.features.admin.tiers.listPaymentProducts,
    {}
  );
  const tierDefs = useAdminQuery(
    api.features.admin.tiers.listTierDefinitions,
    {}
  );
  const createPaymentProduct = useAdminMutation(
    api.features.admin.tiers.createPaymentProduct
  );
  const updatePaymentProduct = useAdminMutation(
    api.features.admin.tiers.updatePaymentProduct
  );
  const deletePaymentProduct = useAdminMutation(
    api.features.admin.tiers.deletePaymentProduct
  );
  const seedPaymentProducts = useAdminMutation(
    api.features.admin.tiers.seedPaymentProducts
  );
  const { confirm } = useConfirmStore();

  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProductId, setEditingProductId] =
    useState<Id<"paymentProducts"> | null>(null);
  const [productForm, setProductForm] = useState({
    tierName: "",
    provider: "polar",
    productId: "",
    isActive: true,
    label: "",
  });
  const [productSaving, setProductSaving] = useState(false);
  const [seedingProducts, setSeedingProducts] = useState(false);

  const openEdit = (product: ProductRow) => {
    setEditingProductId(product._id);
    setProductForm({
      tierName: product.tierName,
      provider: product.provider,
      productId: product.productId,
      isActive: product.isActive,
      label: product.label ?? "",
    });
    setShowProductModal(true);
  };

  const handleDelete = async (product: ProductRow) => {
    const ok = await confirm({
      title: "Delete Product Mapping",
      message: `Remove the ${product.provider} product mapping for tier "${product.tierName}"?`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await deletePaymentProduct({ id: product._id });
      toast("success", "Product mapping deleted");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const columns: Column<ProductRow>[] = [
    {
      key: "tierName",
      header: "Tier",
      sortable: true,
      render: (p) => <Badge variant="default">{p.tierName}</Badge>,
    },
    { key: "provider", header: "Provider", sortable: true },
    {
      key: "productId",
      header: "Product ID",
      render: (p) => (
        <code className="rounded bg-surface-raised px-1.5 py-0.5 text-xs text-ink-muted">
          {p.productId}
        </code>
      ),
    },
    {
      key: "label",
      header: "Label",
      render: (p) => <span className="text-ink-muted">{p.label || "—"}</span>,
    },
    {
      key: "isActive",
      header: "Status",
      className: "text-center",
      render: (p) => (
        <StatusToggle
          active={p.isActive}
          onToggle={async (next) => {
            await updatePaymentProduct({ id: p._id, isActive: next });
            toast(
              "success",
              next ? "Product activated" : "Product deactivated"
            );
          }}
        />
      ),
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      render: (p) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => openEdit(p)}
            aria-label={`Edit ${p.tierName} mapping`}
            className="rounded p-1 text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => handleDelete(p)}
            aria-label={`Delete ${p.tierName} mapping`}
            className="rounded p-1 text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">Payment Products</h2>
          <p className="text-xs text-ink-muted">
            Map payment provider product IDs to tiers. Supports multiple
            providers for easy migration.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={async () => {
              setSeedingProducts(true);
              try {
                const result = await seedPaymentProducts({});
                toast("success", result.message);
              } catch (err) {
                toast(
                  "error",
                  err instanceof Error ? err.message : "Failed to seed"
                );
              } finally {
                setSeedingProducts(false);
              }
            }}
            size="sm"
            variant="ghost"
            disabled={seedingProducts}
          >
            {seedingProducts ? (
              <Spinner className="mr-1.5 h-3.5 w-3.5" />
            ) : (
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            )}
            Sync from Tiers
          </Button>
          <Button
            onClick={() => {
              setEditingProductId(null);
              setProductForm({
                tierName: tierDefs?.[0]?.name ?? "",
                provider: "polar",
                productId: "",
                isActive: true,
                label: "",
              });
              setShowProductModal(true);
            }}
            size="sm"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Product Mapping
          </Button>
        </div>
      </div>

      <QueryState
        data={paymentProducts as unknown as ProductRow[] | undefined}
        empty={{
          message: "No payment product mappings configured.",
        }}
      >
        {(rows) => (
          <DataTable columns={columns} data={rows} rowKey={(p) => p._id} />
        )}
      </QueryState>

      <Drawer
        isOpen={showProductModal}
        onClose={() => setShowProductModal(false)}
        title={
          editingProductId ? "Edit Product Mapping" : "Add Product Mapping"
        }
        width="max-w-md"
      >
        <div className="space-y-4">
          <Select
            label="Tier"
            options={(tierDefs ?? []).map((t) => ({
              value: t.name,
              label: `${t.displayName} (${t.name})`,
            }))}
            value={productForm.tierName}
            disabled={!!editingProductId}
            onChange={(e) =>
              setProductForm({ ...productForm, tierName: e.target.value })
            }
          />

          <Select
            label="Provider"
            options={[{ value: "polar", label: "Polar" }]}
            value={productForm.provider}
            disabled={!!editingProductId}
            onChange={(e) =>
              setProductForm({ ...productForm, provider: e.target.value })
            }
          />

          <Input
            label="Product ID"
            value={productForm.productId}
            onChange={(e) =>
              setProductForm({ ...productForm, productId: e.target.value })
            }
            placeholder="prod_..."
          />

          <Input
            label="Label"
            value={productForm.label}
            onChange={(e) =>
              setProductForm({ ...productForm, label: e.target.value })
            }
            placeholder="e.g. Pro Monthly, Enterprise Annual"
          />

          <Switch
            checked={productForm.isActive}
            onChange={(checked) =>
              setProductForm({ ...productForm, isActive: checked })
            }
            label="Active"
          />

          <div className="flex gap-2 pt-2">
            <Button
              onClick={async () => {
                if (!productForm.productId.trim()) {
                  toast("error", "Product ID is required");
                  return;
                }
                setProductSaving(true);
                try {
                  if (editingProductId) {
                    await updatePaymentProduct({
                      id: editingProductId,
                      productId: productForm.productId,
                      isActive: productForm.isActive,
                      label: productForm.label || undefined,
                    });
                    toast("success", "Product mapping updated");
                  } else {
                    await createPaymentProduct({
                      tierName: productForm.tierName,
                      provider: productForm.provider,
                      productId: productForm.productId,
                      isActive: productForm.isActive,
                      label: productForm.label || undefined,
                    });
                    toast("success", "Product mapping created");
                  }
                  setShowProductModal(false);
                } catch (err) {
                  toast(
                    "error",
                    err instanceof Error ? err.message : "Failed to save"
                  );
                } finally {
                  setProductSaving(false);
                }
              }}
              disabled={productSaving}
              className="flex-1"
            >
              {productSaving ? (
                <Spinner className="h-4 w-4" />
              ) : editingProductId ? (
                "Update"
              ) : (
                "Create"
              )}
            </Button>
            <Button variant="ghost" onClick={() => setShowProductModal(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Drawer>
    </section>
  );
}

function StatusToggle({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: (next: boolean) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <div className="flex justify-center">
      <Switch
        checked={active}
        disabled={saving}
        size="sm"
        onChange={async (next) => {
          setSaving(true);
          try {
            await onToggle(next);
          } catch (err) {
            toast(
              "error",
              err instanceof Error ? err.message : "Failed to toggle"
            );
          } finally {
            setSaving(false);
          }
        }}
      />
    </div>
  );
}
