window.MARLETTA_CONFIG = {
  company: {
    name: "Marletta",
    phoneLabel: "+359 88 000 0000",
    phoneLink: "tel:+359880000000",
    email: "office@marletta.bg",
    emailLink: "mailto:office@marletta.bg",
    address: "България",
    tagline: "Директен вносител на оградни системи, врати и строителни решения"
  },
  dataSource: {
    mode: "google-sheet",
    googleSheet: {
      spreadsheetId: "1WmNf4M-c-aztbLn83z1ouoGdt7hmaIYiOvblNVAAldE",
      categoriesSheet: "Categories",
      productsSheet: "Products",
      attributesSheet: "Attributes"
    },
    local: {
      categoriesUrl: "data/categories.csv",
      productsUrl: "data/products.csv",
      attributesUrl: "data/attributes.csv"
    }
  }
};