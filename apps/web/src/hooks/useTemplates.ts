import { useState, useCallback, useMemo } from "react";
import {
  BUILT_IN_TEMPLATES,
  getTemplateById,
  getTemplatesByProjectType,
  searchTemplates,
  type EnvironmentTemplate,
  type ProjectType,
} from "@/constants/templates";

interface UseTemplatesOptions {
  projectType?: ProjectType;
  searchQuery?: string;
}

interface UseTemplatesReturn {
  templates: EnvironmentTemplate[];
  isLoading: boolean;
  error: string | null;
  selectedTemplate: EnvironmentTemplate | null;
  selectTemplate: (templateId: string | null) => void;
  searchTemplates: (query: string) => void;
  filterByProjectType: (type: ProjectType | null) => void;
  seedBuiltInTemplates: () => Promise<void>;
  duplicateTemplate: (
    templateId: string,
    newName: string
  ) => Promise<string | null>;
}

/**
 * Hook for managing environment templates
 * Provides access to built-in templates and CRUD operations for custom templates
 */
export function useTemplates(
  options: UseTemplatesOptions = {}
): UseTemplatesReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState(options.searchQuery || "");
  const [projectTypeFilter, setProjectTypeFilter] =
    useState<ProjectType | null>(options.projectType || null);

  // Filter templates based on search and project type
  const templates = useMemo(() => {
    let filtered = BUILT_IN_TEMPLATES;

    // Apply project type filter
    if (projectTypeFilter) {
      filtered = getTemplatesByProjectType(projectTypeFilter);
    }

    // Apply search filter
    if (searchQuery) {
      filtered = searchTemplates(searchQuery).filter((t) =>
        projectTypeFilter ? t.projectType === projectTypeFilter : true
      );
    }

    return filtered;
  }, [searchQuery, projectTypeFilter]);

  // Get selected template
  const selectedTemplate = useMemo(() => {
    if (!selectedTemplateId) return null;
    return getTemplateById(selectedTemplateId) || null;
  }, [selectedTemplateId]);

  // Select a template
  const selectTemplate = useCallback((templateId: string | null) => {
    setSelectedTemplateId(templateId);
  }, []);

  // Search templates
  const handleSearchTemplates = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  // Filter by project type
  const filterByProjectType = useCallback((type: ProjectType | null) => {
    setProjectTypeFilter(type);
  }, []);

  // Seed built-in templates to the database
  const seedBuiltInTemplates = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/templates/seed", {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to seed templates");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Duplicate a template (creates a custom copy)
  const duplicateTemplate = useCallback(
    async (templateId: string, newName: string): Promise<string | null> => {
      setIsLoading(true);
      setError(null);

      try {
        // Get active organization first
        const authResponse = await fetch("/api/auth/me");
        const authData = await authResponse.json();

        if (!authData.organization?.id) {
          throw new Error("No organization found");
        }

        const organizationId = authData.organization.id;

        // Get the source template
        const sourceTemplate = getTemplateById(templateId);
        if (!sourceTemplate) {
          throw new Error("Source template not found");
        }

        // Create a new template based on the source
        const response = await fetch("/api/templates", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: newName,
            description: sourceTemplate.description,
            projectType: sourceTemplate.projectType,
            icon: sourceTemplate.icon,
            color: sourceTemplate.color,
            version: sourceTemplate.version,
            tags: sourceTemplate.tags,
            organizationId,
            isPublished: false,
            variables: sourceTemplate.variables.map((v) => ({
              key: v.key,
              description: v.description,
              defaultValue: v.defaultValue,
              placeholder: v.placeholder,
              environments: v.environments,
              isSensitive: v.isSensitive,
              isRequired: v.isRequired,
              category: v.category,
            })),
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to duplicate template");
        }

        const data = await response.json();
        return data.template._id;
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return {
    templates,
    isLoading,
    error,
    selectedTemplate,
    selectTemplate,
    searchTemplates: handleSearchTemplates,
    filterByProjectType,
    seedBuiltInTemplates,
    duplicateTemplate,
  };
}

/**
 * Hook for working with a single template
 */
export function useTemplate(templateId: string | null) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get template from built-in templates
  const template = useMemo(() => {
    if (!templateId) return null;
    return getTemplateById(templateId) || null;
  }, [templateId]);

  // Apply template to create variables for a project
  const applyTemplate = useCallback(
    async (projectId: string): Promise<boolean> => {
      if (!template) {
        setError("No template selected");
        return false;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Create variables sequentially to avoid overwhelming the WorkOS Vault API.
        // Parallel calls (Promise.all) cause rate-limit / timeout 500 errors when
        // templates have many variables.
        let failedCount = 0;

        for (const variable of template.variables) {
          const placeholderValue =
            variable.defaultValue ||
            variable.placeholder ||
            `<${variable.key}>`;

          const response = await fetch("/api/variables", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              key: variable.key,
              value: placeholderValue,
              description: variable.description,
              environments: variable.environments,
              projectId,
              isSensitive: variable.isSensitive,
            }),
          });

          if (!response.ok) {
            const data = await response.json();
            console.error(
              `Failed to create variable ${variable.key}:`,
              data.error
            );
            failedCount++;
          }
        }

        return failedCount === 0;
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [template]
  );

  return {
    template,
    isLoading,
    error,
    applyTemplate,
  };
}
