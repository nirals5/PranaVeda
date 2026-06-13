import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';

export default function PranaBackground() {
  const [isHovered, setIsHovered] = useState(false);
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; size: number; delay: number; duration: number }[]>([]);

  // Generate floating dew particles
  useEffect(() => {
    const generated = Array.from({ length: 18 }).map((_, i) => ({
      id: i,
      x: Math.random() * 100, // percentage x
      y: Math.random() * 100, // percentage y
      size: Math.random() * 4 + 2, // 2px to 6px
      delay: Math.random() * 5,
      duration: Math.random() * 8 + 12, // slow rise
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
      {/* Soft Pastel Gradient Mesh Blobs - Interactive drift */}
      <div className="absolute inset-0 opacity-20 blur-[130px]">
        {/* Blush Blob */}
        <motion.div
          animate={{
            x: [0, 40, -20, 0],
            y: [0, -30, 40, 0],
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute -top-10 -left-10 w-[450px] h-[450px] rounded-full bg-[#FBEDE9]"
        />

        {/* Lavender Blob */}
        <motion.div
          animate={{
            x: [0, -40, 30, 0],
            y: [0, 40, -30, 0],
          }}
          transition={{
            duration: 30,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute top-1/3 right-[-100px] w-[500px] h-[500px] rounded-full bg-[#E8E1F2]"
        />
      </div>

      {/* Artistic Flair Lines & Circles Overlay */}
      <svg className="absolute inset-0 w-full h-full opacity-60 text-white" viewBox="0 0 1024 768" preserveAspectRatio="none" fill="none">
        <path d="M-50,400 Q200,300 400,450 T800,400 T1100,500" stroke="currentColor" strokeWidth="2.5" opacity="0.6"/>
        <path d="M-100,600 Q300,500 500,650 T900,550 T1200,700" stroke="currentColor" strokeWidth="1.8" opacity="0.4"/>
        <circle cx="800" cy="200" r="120" fill="currentColor" opacity="0.12"/>
        <circle cx="200" cy="600" r="150" fill="currentColor" opacity="0.12"/>
      </svg>

      {/* Hand-Drawn Flowing Waves for additional natural style depth */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.12] text-neutral-650 stroke-current" fill="none">
        <motion.path
          d="M -100 200 C 300 250, 600 150, 1000 300 C 1300 400, 1600 300, 2000 350"
          strokeWidth="1.2"
          animate={{
            d: [
              "M -100 200 C 300 250, 600 150, 1000 300 C 1300 400, 1600 300, 2000 350",
              "M -100 220 C 280 270, 630 130, 980 320 C 1320 380, 1580 320, 2000 330",
              "M -100 200 C 300 250, 600 150, 1000 300 C 1300 400, 1600 300, 2000 350"
            ]
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.path
          d="M -100 450 C 400 350, 700 500, 1100 420 C 1400 380, 1700 480, 2000 440"
          strokeWidth="1"
          animate={{
            d: [
              "M -100 450 C 400 350, 700 500, 1100 420 C 1400 380, 1700 480, 2000 440",
              "M -100 430 C 420 370, 680 480, 1120 440 C 1380 400, 1720 460, 2000 460",
              "M -100 450 C 400 350, 700 500, 1100 420 C 1400 380, 1700 480, 2000 440"
            ]
          }}
          transition={{
            duration: 24,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 2
          }}
        />
        <path
          d="M -100 700 C 200 650, 650 780, 1050 720 C 1450 660, 1650 750, 2000 700"
          strokeWidth="1"
          strokeDasharray="4 4"
        />
      </svg>

      {/* 3. Tiny Drifting Shimmering Dew Particles */}
      <div className="absolute inset-0 pointer-events-none">
        {particles.map((p) => (
          <motion.div
            key={p.id}
            className="absolute rounded-full bg-white opacity-[0.45] shadow-[0_0_10px_2px_rgba(255,255,255,0.7)]"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
            }}
            animate={{
              y: ['0px', '-40px', '0px'],
              opacity: [0.2, 0.7, 0.2],
              scale: [1, 1.25, 1],
            }}
            transition={{
              duration: p.duration,
              repeat: Infinity,
              ease: "easeInOut",
              delay: p.delay,
            }}
          />
        ))}
      </div>

      {/* 4. Elegant Minimalist Lotus Flower representing Prana & Ayurveda */}
      {/* Positioned in background - soft, airy, and beautiful */}
      <div 
        className="absolute bottom-12 right-12 w-48 h-48 sm:w-64 sm:h-64 opacity-25 md:opacity-30 pointer-events-auto cursor-pointer flex items-center justify-center"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        title="Breathe with the Living Lotus"
      >
        <motion.svg
          viewBox="0 0 100 100"
          className="w-full h-full fill-none stroke-stone-800"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          animate={{
            scale: [0.96, 1.04, 0.96],
          }}
          transition={{
            duration: 8, // slow calming breathing cycle
            repeat: Infinity,
            ease: "easeInOut"
          }}
        >
          {/* Base leaves */}
          <path d="M 30 75 C 38 82, 62 82, 70 75" strokeWidth="1" strokeDasharray="1 2" />
          <path d="M 22 70 C 35 78, 65 78, 78 70" strokeWidth="0.8" />

          {/* Left Outermost Petal */}
          <motion.path
            d="M 50 75 C 25 65, 25 45, 36 38 C 42 50, 48 65, 50 75"
            animate={{
              rotate: isHovered ? -8 : -1,
              originX: "50px",
              originY: "75px"
            }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />

          {/* Right Outermost Petal */}
          <motion.path
            d="M 50 75 C 75 65, 75 45, 64 38 C 58 50, 52 65, 50 75"
            animate={{
              rotate: isHovered ? 8 : 1,
              originX: "50px",
              originY: "75px"
            }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />

          {/* Left Inner Petal */}
          <motion.path
            d="M 50 75 C 33 60, 31 35, 43 25 C 47 42, 49 60, 50 75"
            animate={{
              rotate: isHovered ? -4 : 0,
              originX: "50px",
              originY: "75px"
            }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />

          {/* Right Inner Petal */}
          <motion.path
            d="M 50 75 C 67 60, 69 35, 57 25 C 53 42, 51 60, 50 75"
            animate={{
              rotate: isHovered ? 4 : 0,
              originX: "50px",
              originY: "75px"
            }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />

          {/* Center Lotus Petal (Spine of Breath) */}
          <motion.path
            d="M 50 75 C 43 50, 45 25, 50 15 C 55 25, 57 50, 50 75"
            animate={{
              scaleY: [1, 1.05, 1],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />

          {/* Gentle Dewdrops on Petals */}
          <motion.circle
            cx="43"
            cy="27"
            r="1"
            className="fill-stone-800"
            animate={{
              opacity: [0.3, 1, 0.3],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
          <motion.circle
            cx="50"
            cy="17"
            r="1.2"
            className="fill-stone-800"
            animate={{
              opacity: [1, 0.2, 1],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 1
            }}
          />
          <motion.circle
            cx="57"
            cy="27"
            r="1"
            className="fill-stone-800"
            animate={{
              opacity: [0.4, 0.9, 0.4],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.5
            }}
          />
        </motion.svg>
      </div>
    </div>
  );
}
