import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import RenderNamespaces from "./RenderNamespaces";
import { NamespaceTree } from "../../hooks/useNamespaceTree";
import NamespaceIcon from "./NamespaceIcon";

interface NamespaceItemProps {
  namespace: string;
  path: string[];
  isExpanded: boolean;
  isSelected: boolean;
  isHighlighted: boolean;
  hasChildren: boolean;
  tree: NamespaceTree;
}

const formatNamespaceLabel = (
  value: string,
  t: (key: string, options?: { defaultValue: string }) => string
): string => {
  const normalized = value.replaceAll("_", " ");
  const translationKey = value.replaceAll("_", "-").toLowerCase();
  if (normalized.toLowerCase() === "openai") {
    return t("namespaces.openai", { defaultValue: "OpenAI" });
  }
  return t(`namespaces.${translationKey}`, { defaultValue: normalized });
};

const NamespaceItem: React.FC<NamespaceItemProps> = ({
  namespace,
  path,
  isExpanded,
  isSelected,
  isHighlighted,
  hasChildren,
  tree
}) => {
  const { t } = useTranslation("nodeMenu");
  const setSelectedPath = useNodeMenuStore((state) => state.setSelectedPath);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLLIElement>) => {
      e.stopPropagation();
      if (isSelected) {
        return;
      }
      setSelectedPath(path);
    },
    [isSelected, path, setSelectedPath]
  );

  const isTopLevel = path.length === 1;

  return (
    <>
      <li
        className={`list-item ${isExpanded ? "expanded" : "collapsed"} ${
          isSelected ? "selected" : ""
        } ${isHighlighted ? "highlighted" : "no-highlight"}`}
        onClick={handleClick}
      >
        <div className="namespace-item">
          {isTopLevel && <NamespaceIcon namespace={namespace} />}
          <span className="namespace-label">
            {formatNamespaceLabel(namespace, t)}
          </span>
        </div>
      </li>
      {hasChildren && isExpanded && (
        <div className="sublist">
          <RenderNamespaces
            tree={tree[namespace].children}
            currentPath={path}
          />
        </div>
      )}
    </>
  );
};

export default React.memo(NamespaceItem);
