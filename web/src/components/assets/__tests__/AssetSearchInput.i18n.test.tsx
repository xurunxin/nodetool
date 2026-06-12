import React from "react";
import { screen } from "@testing-library/react";

import { renderWithI18n } from "../../../i18n/__tests__/testUtils";
import AssetSearchInput from "../AssetSearchInput";

jest.mock("../../../stores/KeyPressedStore", () => ({
  useKeyPressedStore: () => false
}));

jest.mock("../../../stores/AssetGridStore", () => ({
  useAssetGridStore: (selector: (state: unknown) => unknown) =>
    selector({
      isGlobalSearchMode: false,
      setIsGlobalSearchMode: jest.fn(),
      setGlobalSearchResults: jest.fn(),
      setIsGlobalSearchActive: jest.fn(),
      setGlobalSearchQuery: jest.fn()
    })
}));

jest.mock("../../../serverState/useAssetSearch", () => ({
  useAssetSearch: () => ({
    searchAssets: jest.fn(),
    isSearching: false
  })
}));

describe("AssetSearchInput i18n", () => {
  it("renders localized local-search text", () => {
    renderWithI18n(<AssetSearchInput onLocalSearchChange={jest.fn()} />);

    expect(screen.getByLabelText("搜索当前文件夹")).toBeInTheDocument();
    expect(screen.getByTestId("asset-search-input-field")).toHaveAttribute(
      "placeholder",
      "搜索当前文件夹..."
    );
  });
});
