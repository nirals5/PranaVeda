import React from 'react';
import logoSvg from '../assets/pranaveda_logo.svg';
import iconSvg from '../assets/pranaveda_icon.svg';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  iconOnly?: boolean;
}

export default function Logo({ className = '', size = 'md', iconOnly = false }: LogoProps) {
  const height = { sm: 16, md: 22, lg: 32 }[size];

  return (
    <div className={`flex items-center ${className}`}>
      {iconOnly || size === 'sm' ? (
        <img src={iconSvg} alt="PranaVeda" style={{ height, display: 'block' }} />
      ) : (
        <img src={logoSvg} alt="PranaVeda" style={{ height, display: 'block' }} />
      )}
    </div>
  );
}
