export interface Branch {
  id: string;
  name: string;
}

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  image: string | null;
  branchId: string;
  branchName: string;
}

export interface CartItem extends MenuItem {
  quantity: number;
}

export interface StudentOrderPayload {
  sessionId: string;
  branchId: string;
  studentEmail: string;
  items: Array<{
    id: string;
    name: string;
    price: number;
    category: string;
    quantity: number;
  }>;
  totalAmount: number;
}
