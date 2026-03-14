export type Chain = "L1" | "L2" | "L3";

export interface GSTAmountProps {
  amount: bigint | string | number;
  decimals?: number;
  showSymbol?: boolean;
  className?: string;
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}
