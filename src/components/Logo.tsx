import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function Logo({ className = '', size = 'md' }: LogoProps) {
  const iconSize = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-16 h-16'
  }[size];

  const textSize = {
    sm: 'text-sm tracking-wider',
    md: 'text-xl tracking-widest',
    lg: 'text-3xl tracking-widest'
  }[size];

  const subSize = {
    sm: 'text-[7px]',
    md: 'text-[9px]',
    lg: 'text-[11px]'
  }[size];

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Dynamic SVG Lotus Logomark */}
      <div className={`relative ${iconSize} flex items-center justify-center`}>
        {/* Glow behind logo */}
        <div className="absolute inset-0 bg-white/20 blur-md rounded-full" />
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full text-stone-800 relative z-10 transition-transform duration-500 hover:scale-110"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Subtle outer petal rings */}
          <circle cx="50" cy="50" r="44" strokeWidth="0.5" strokeDasharray="2 3" className="opacity-40" />
          
          {/* Outermost bottom leaves */}
          <path d="M 25 65 C 35 72, 65 72, 75 65" className="opacity-70" />

          {/* Left Petal */}
          <path d="M 50 68 C 30 55, 30 35, 42 28 C 47 40, 49 55, 50 68" />
          
          {/* Right Petal */}
          <path d="M 50 68 C 70 55, 70 35, 58 28 C 53 40, 51 55, 50 68" />

          {/* Center Lotus Blade */}
          <path d="M 50 68 C 44 45, 45 22, 50 12 C 55 22, 56 45, 50 68" fill="rgba(232, 225, 242, 0.4)" />
          
          {/* Golden/Shimmering dew points */}
          <circle cx="50" cy="12" r="1.5" className="fill-stone-800" />
          <circle cx="42" cy="28" r="1" className="fill-stone-800 opacity-80" />
          <circle cx="58" cy="28" r="1" className="fill-stone-800 opacity-80" />
        </svg>
      </div>

      <div className="flex flex-col">
        <span className={`font-serif font-light text-stone-900 leading-none ${textSize}`}>
          Prana<span className="font-medium">Veda</span>
        </span>
        <span className={`font-mono text-stone-500 tracking-[0.3em] font-medium leading-none mt-1 ${subSize}`}>
          AI WELLNESS COACH
        </span>
      </div>
    </div>
  );
}
