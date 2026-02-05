import React, { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'secondary' | 'outline' | 'destructive' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export function Button({ 
  variant = 'default', 
  size = 'md', 
  children, 
  className = '', 
  disabled,
  ...props 
}: ButtonProps) {
  const baseStyles = 'font-medium rounded-xl transition-all duration-200 flex items-center justify-center gap-2';
  
  const variantStyles = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50',
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    outline: 'border-2 border-border bg-background text-foreground hover:bg-secondary',
    destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
    danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
    ghost: 'text-foreground hover:bg-secondary',
  };
  
  const sizeStyles = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
