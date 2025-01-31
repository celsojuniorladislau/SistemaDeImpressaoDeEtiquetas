export interface Product {
  [key: string]: string | number | null | undefined; // Adicionando undefined ao index signature
  id?: number;
  name: string;
  code: string;
  description: string;
  created_at?: string;
  updated_at?: string;
}

