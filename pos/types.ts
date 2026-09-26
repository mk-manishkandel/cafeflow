export interface Staff {
  id: string;
  name: string;
  email: string;
  mobileNumber?: string;
  department: string;
  monthlyAllowance: number;
  currentBalance: number;
  avatar: string;
  status?: 'ACTIVE' | 'INACTIVE';
}

export interface Consumer {
  id: string;
  name: string;
  email: string;
  mobileNumber?: string;
  category: string;
  studentId?: string | null;
  remarks?: string | null;
  branchId?: string | null;
  openingBalance: number;
  currentBalance: number;
  avatar: string;
}

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  image?: string;
  branchId?: string | null;
  isTodayMenu?: boolean;
  available?: boolean;
  isSelfService?: boolean;
}

export interface Category {
  id: string;
  name: string;
  branchId?: string;
}

export interface Branch {
  id: string;
  name: string;
  address: string;
  is_self_service_enabled?: boolean;
}

export interface CartItem extends MenuItem {
  quantity: number;
  remarks?: string;
}

export interface Transaction {
  id: string;
  staffId: string;
  consumerId?: string;
  staffName: string;
  items: CartItem[];
  totalAmount: number;
  timestamp: string;
  branchId?: string | null;
  status?: 'COMPLETED' | 'REFUNDED';
  type?: string;
  paymentMethod?: string;
  orderNumber?: number;
  branchName?: string;
  orderSource?: string;
  cashierName?: string;
  eventName?: string;
  eventBy?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  aggregates?: Record<string, any>;
}

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'staff' | 'cashier';
  permissions?: string[];
  branchId?: string | null;
  isActive?: boolean;
}

// For AI Menu Generation
export interface AIHelperResponse {
  category: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  details: string;
  branch_id?: string;
  timestamp: string;
}


export interface PaymentMethodSettings {
  id: string;
  name: string;
  type: 'cash' | 'card' | 'digital' | 'bank';
  isDefault: boolean;
  qrType?: 'none' | 'static';
  qrData?: string | null;
  showQrInPos?: boolean;
  config?: any;
}

export interface ItemSalesData {
  id: string;
  itemName: string;
  branchId: string;
  branchName: string;
  category: string;
  quantity: number;
  totalRevenue: number;
  averagePrice: number;
}

export interface DocumentTemplate {
  id: string;
  name: string;
  type: string;
  description?: string;
  template_html: string;
  template_css?: string;
  placeholders?: string[];
  is_default: boolean;
  is_active: boolean;
  branch_id?: string;
  branch_name?: string;
  created_by?: string;
  created_by_name?: string;
  updated_by?: string;
  created_at: string;
  updated_at: string;
}

