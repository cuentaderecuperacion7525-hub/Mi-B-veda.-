import React from 'react';
import { Delete, Fingerprint } from 'lucide-react';

interface PinKeypadProps {
  pin: string;
  onPinChange: (newPin: string) => void;
  onSubmit?: () => void;
  maxDigits?: number;
  disabled?: boolean;
  onBiometricRequest?: () => void;
  isBiometricsEnrolled?: boolean;
  isBiometricsLoading?: boolean;
}

interface KeyConfig {
  type: 'digit' | 'biometric' | 'backspace';
  digit?: string;
  letters?: string;
  ariaLabel?: string;
}

const KEYPAD_LAYOUT: KeyConfig[][] = [
  [
    { type: 'digit', digit: '1', letters: ' ' },
    { type: 'digit', digit: '2', letters: 'ABC' },
    { type: 'digit', digit: '3', letters: 'DEF' },
  ],
  [
    { type: 'digit', digit: '4', letters: 'GHI' },
    { type: 'digit', digit: '5', letters: 'JKL' },
    { type: 'digit', digit: '6', letters: 'MNO' },
  ],
  [
    { type: 'digit', digit: '7', letters: 'PQRS' },
    { type: 'digit', digit: '8', letters: 'TUV' },
    { type: 'digit', digit: '9', letters: 'WXYZ' },
  ],
  [
    { type: 'biometric', ariaLabel: 'Sensor de huella digital' },
    { type: 'digit', digit: '0', letters: '+' },
    { type: 'backspace', ariaLabel: 'Borrar dígito' },
  ],
];

export const PinKeypad: React.FC<PinKeypadProps> = ({
  pin,
  onPinChange,
  onSubmit,
  maxDigits = 6,
  disabled = false,
  onBiometricRequest,
  isBiometricsEnrolled = false,
  isBiometricsLoading = false,
}) => {
  const handleDigit = (digit: string) => {
    if (disabled) return;
    if (pin.length < maxDigits) {
      const nextPin = pin + digit;
      onPinChange(nextPin);
      if (nextPin.length === maxDigits && onSubmit) {
        setTimeout(() => onSubmit(), 60);
      }
    }
  };

  const handleDelete = () => {
    if (disabled) return;
    if (pin.length > 0) {
      onPinChange(pin.slice(0, -1));
    }
  };

  return (
    <div className="w-full max-w-[300px] mx-auto select-none">
      {/* PIN Dots Indicator with subtle neon glow */}
      <div className="flex justify-center items-center gap-3.5 mb-7 h-9">
        {Array.from({ length: maxDigits }).map((_, index) => {
          const filled = index < pin.length;
          return (
            <div
              key={index}
              className={`w-3.5 h-3.5 rounded-full transition-all duration-200 transform ${
                filled
                  ? 'bg-gradient-to-tr from-[#00e5ff] to-blue-500 scale-125 shadow-[0_0_12px_rgba(0,229,255,0.7)]'
                  : 'bg-slate-800/90 border border-slate-700/70 shadow-inner'
              }`}
            />
          );
        })}
      </div>

      {/* Modern Numeric Keypad Grid */}
      <div className="grid grid-cols-3 gap-3 sm:gap-3.5">
        {KEYPAD_LAYOUT.flat().map((keyItem, index) => {
          if (keyItem.type === 'backspace') {
            return (
              <button
                key="key-backspace"
                type="button"
                onClick={handleDelete}
                disabled={disabled || pin.length === 0}
                aria-label={keyItem.ariaLabel}
                className="h-15 sm:h-16 rounded-2xl flex flex-col items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800/70 active:scale-95 active:bg-rose-500/20 active:text-rose-400 border border-transparent hover:border-slate-700/60 transition-all cursor-pointer disabled:opacity-20 disabled:pointer-events-none"
              >
                <Delete className="w-5 h-5 stroke-[2]" />
              </button>
            );
          }

          if (keyItem.type === 'biometric') {
            return (
              <button
                key="key-biometric"
                type="button"
                onClick={onBiometricRequest}
                disabled={disabled || isBiometricsLoading}
                aria-label={keyItem.ariaLabel}
                title={
                  isBiometricsEnrolled
                    ? 'Toca para escanear huella digital'
                    : 'Toca para activar sensor de huella'
                }
                className={`h-15 sm:h-16 rounded-2xl flex flex-col items-center justify-center relative transition-all active:scale-95 group cursor-pointer ${
                  isBiometricsEnrolled
                    ? 'bg-[#00e5ff]/10 hover:bg-[#00e5ff]/20 border border-[#00e5ff]/35 text-[#00e5ff] shadow-[0_0_16px_rgba(0,229,255,0.15)]'
                    : 'bg-slate-800/40 hover:bg-slate-800/70 border border-slate-700/50 text-slate-400 hover:text-[#00e5ff] hover:border-[#00e5ff]/30'
                } disabled:opacity-30 disabled:pointer-events-none`}
              >
                <Fingerprint
                  className={`w-6 h-6 transition-transform group-hover:scale-110 ${
                    isBiometricsLoading
                      ? 'animate-pulse text-[#00e5ff]'
                      : isBiometricsEnrolled
                      ? 'text-[#00e5ff]'
                      : 'text-slate-400 group-hover:text-[#00e5ff]'
                  }`}
                />
                <span className="text-[8px] font-bold tracking-wider uppercase mt-0.5 text-slate-400 group-hover:text-[#00e5ff]">
                  {isBiometricsLoading ? 'Leyendo...' : 'Huella'}
                </span>
              </button>
            );
          }

          const digit = keyItem.digit || '0';
          const letters = keyItem.letters || ' ';

          return (
            <button
              key={`key-${digit}-${index}`}
              type="button"
              onClick={() => handleDigit(digit)}
              disabled={disabled}
              className="group h-15 sm:h-16 rounded-2xl bg-slate-800/50 hover:bg-slate-800/85 active:scale-95 active:bg-[#00e5ff]/20 active:border-[#00e5ff]/50 border border-slate-700/60 hover:border-slate-600 transition-all flex flex-col items-center justify-center shadow-sm cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
            >
              <span className="text-2xl font-bold tracking-tight text-white leading-none group-hover:text-[#00e5ff] transition-colors">
                {digit}
              </span>
              <span className="text-[9px] font-semibold tracking-[0.16em] uppercase text-slate-400/90 group-hover:text-slate-300 mt-1 leading-none h-2.5">
                {letters}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
