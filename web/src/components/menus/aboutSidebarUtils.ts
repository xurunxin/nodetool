import { isProduction } from "../../lib/env";

interface SidebarSection {
  category: string;
  items: Array<{ id: string; label: string }>;
  defaultCollapsed?: boolean;
}

export interface AboutSidebarLabels {
  application: string;
  operatingSystem: string;
  featuresVersions: string;
  resources: string;
  installationPaths: string;
  links: string;
}

const DEFAULT_ABOUT_SIDEBAR_LABELS: AboutSidebarLabels = {
  application: "Application",
  operatingSystem: "Operating System",
  featuresVersions: "Features & Versions",
  resources: "Resources",
  installationPaths: "Installation Paths",
  links: "Links"
};

export const getAboutSidebarSections = (
  labels: AboutSidebarLabels = DEFAULT_ABOUT_SIDEBAR_LABELS
): SidebarSection[] => {
  return [
    {
      category: labels.application,
      items: [
        { id: "application", label: labels.application },
        { id: "operating-system", label: labels.operatingSystem },
        { id: "features", label: labels.featuresVersions }
      ]
    },
    {
      category: labels.resources,
      items: [
        ...(!isProduction
          ? [{ id: "installation-paths", label: labels.installationPaths }]
          : []),
        { id: "links", label: labels.links }
      ]
    }
  ];
};
