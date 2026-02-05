import React, { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  hover?: boolean;
}

export function Card({ children, hover = false, className = '', ...props }: CardProps) {
  const baseStyles = 'bg-card text-card-foreground rounded-2xl shadow-lg border border-border';
  const hoverStyles = hover ? 'hover:shadow-xl hover:border-primary transition-all duration-200 cursor-pointer' : '';

  return (
    <div className={`${baseStyles} ${hoverStyles} ${className}`} {...props}>
      {children}
    </div>
  );
}
