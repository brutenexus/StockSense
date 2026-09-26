import Image from 'next/image';
import logoTransparent from '@/app/logo-transparent.png';

/**
 * The StockSense brand mark — the uploaded logo with its white background
 * removed, served through next/image (self-hosted, sharp automatically).
 */
export function Logo({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <Image
      src={logoTransparent}
      alt="StockSense logo"
      width={size}
      height={size}
      priority={size >= 40}
      className={className}
    />
  );
}
