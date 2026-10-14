import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import watermarkSvg from '../assets/watermark.svg';

export default function PranaBackground() {
  const [isHovered, setIsHovered] = useState(false);
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; size: number; delay: number; duration: number }[]>([]);

  useEffect(() => {
    const generated = Array.from({ length: 18 }).map((_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 4 + 2,
      delay: Math.random() * 5,
      duration: Math.random() * 8 + 12,
    }));
    setParticles(generated);
  }, []);

  return (
    <div
      className="fixed inset-0 -z-10 overflow-hidden select-none pointer-events-none"
      style={{
        background: `
          radial-gradient(circle at 10% 10%, #FBEDE9 0%, transparent 40%),
          radial-gradient(circle at 90% 15%, #E8E1F2 0%, transparent 45%),
          radial-gradient(circle at 85% 85%, #DFE8FA 0%, transparent 50%),
          radial-gradient(circle at 15% 80%, #DDF5EE 0%, transparent 45%)
        `,
        backgroundColor: '#FDFDFD'
      }}
    >
      {/* Drifting mesh blobs */}
      <div className="absolute inset-0 opacity-20 blur-[130px]">
        <motion.div
          animate={{ x: [0, 40, -20, 0], y: [0, -30, 40, 0] }}
          transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-10 -left-10 w-[450px] h-[450px] rounded-full bg-[#FBEDE9]"
        />
        <motion.div
          animate={{ x: [0, -40, 30, 0], y: [0, 40, -30, 0] }}
          transition={{ duration: 30, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-1/3 right-[-100px] w-[500px] h-[500px] rounded-full bg-[#E8E1F2]"
        />
      </div>

      {/* Artistic arc lines & circles. Every animated SVG attribute also gets an
          `initial` value: without one, motion writes "undefined" to cx/cy/d on
          its first frame and the browser logs an error for each. */}
      <svg className="absolute inset-0 w-full h-full opacity-20 md:opacity-60 text-white" viewBox="0 0 1024 768" preserveAspectRatio="none" fill="none">
        <motion.path
          initial={{ d: 'M-50,400 Q200,300 400,450 T800,400 T1100,500' }}
          d="M-50,400 Q200,300 400,450 T800,400 T1100,500"
          stroke="currentColor" strokeWidth="2.5" opacity="0.6"
          animate={{ d: [
            'M-50,400 Q200,300 400,450 T800,400 T1100,500',
            'M-50,415 Q215,285 385,465 T815,390 T1100,515',
            'M-50,400 Q200,300 400,450 T800,400 T1100,500',
          ]}}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.path
          initial={{ d: 'M-100,600 Q300,500 500,650 T900,550 T1200,700' }}
          d="M-100,600 Q300,500 500,650 T900,550 T1200,700"
          stroke="currentColor" strokeWidth="1.8" opacity="0.4"
          animate={{ d: [
            'M-100,600 Q300,500 500,650 T900,550 T1200,700',
            'M-100,612 Q288,488 512,638 T888,562 T1200,688',
            'M-100,600 Q300,500 500,650 T900,550 T1200,700',
          ]}}
          transition={{ duration: 28, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
        />
        <motion.circle cx="800" cy="200" r="120" fill="currentColor" opacity="0.12"
          initial={{ cx: 800, cy: 200 }}
          animate={{ cx: [800, 820, 800], cy: [200, 185, 200] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.circle cx="200" cy="600" r="150" fill="currentColor" opacity="0.12"
          initial={{ cx: 200, cy: 600 }}
          animate={{ cx: [200, 180, 200], cy: [600, 615, 600] }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
        />
      </svg>

      {/* Flowing wave lines */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.16] md:opacity-[0.24] text-stone-300 stroke-current" fill="none">
        <motion.path
          initial={{ d: 'M -100 200 C 600 80, 1400 440, 2100 300' }}
          d="M -100 200 C 600 80, 1400 440, 2100 300"
          strokeWidth="1.2"
          animate={{ d: [
            'M -100 200 C 600 80, 1400 440, 2100 300',
            'M -100 220 C 580 100, 1420 420, 2100 280',
            'M -100 200 C 600 80, 1400 440, 2100 300',
          ]}}
          transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.path
          initial={{ d: 'M -100 450 C 600 300, 1400 560, 2100 420' }}
          d="M -100 450 C 600 300, 1400 560, 2100 420"
          strokeWidth="1"
          animate={{ d: [
            'M -100 450 C 600 300, 1400 560, 2100 420',
            'M -100 430 C 620 320, 1380 540, 2100 440',
            'M -100 450 C 600 300, 1400 560, 2100 420',
          ]}}
          transition={{ duration: 24, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
        <path
          d="M -100 700 C 200 650, 650 780, 1050 720 C 1450 660, 1650 750, 2000 700"
          strokeWidth="1"
          strokeDasharray="4 4"
        />
      </svg>

      {/* Drifting dew particles */}
      <div className="absolute inset-0 pointer-events-none">
        {particles.map((p) => (
          <motion.div
            key={p.id}
            className="absolute rounded-full bg-white opacity-[0.45] shadow-[0_0_10px_2px_rgba(255,255,255,0.7)]"
            style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${p.size}px`, height: `${p.size}px` }}
            animate={{ y: ['0px', '-40px', '0px'], opacity: [0.2, 0.7, 0.2], scale: [1, 1.25, 1] }}
            transition={{ duration: p.duration, repeat: Infinity, ease: 'easeInOut', delay: p.delay }}
          />
        ))}
      </div>

      {/* Watermark */}
      <motion.img
        src={watermarkSvg}
        alt=""
        className="absolute bottom-12 right-12 w-28 h-28 sm:w-48 sm:h-48 md:w-64 md:h-64 opacity-10 sm:opacity-20 md:opacity-30 pointer-events-auto cursor-pointer select-none z-10"
        title="Breathe with PranaVeda"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        animate={{
          scale: isHovered ? [1.04, 1.08, 1.04] : [0.96, 1.04, 0.96],
        }}
        transition={{
          duration: isHovered ? 4 : 8,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
    </div>
  );
}
