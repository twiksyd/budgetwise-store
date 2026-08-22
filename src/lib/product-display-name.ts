export type ProductNameSource = {
  name: string;
  display_name?: string | null;
};

export function getProductDisplayName(product: ProductNameSource) {
  return product.display_name?.trim() || product.name;
}
