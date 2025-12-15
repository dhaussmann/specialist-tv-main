// User authentication types

export interface User {
  username: string;
  email?: string;
  name?: string;
  picture?: string;
  exp: number;
}

export interface AuthContextType {
  isAuthenticated: boolean;
  token: string | null;
  user: User | null;
  login: (token: string) => void;
  logout: () => void;
  loading: boolean;
}
