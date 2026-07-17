import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * Anna Super Mart brand mark — `public/logo.png`.
 * Used in the sidebar, auth screens, and anywhere the product name
 * needs a visual identity.
 */
export function BrandLogo({
  className,
  size = 32,
  priority = false,
}: {
  className?: string;
  size?: number;
  priority?: boolean;
}) {
  return (
    <Image
      src="/logo.png"
      alt="Anna Super Mart"
      width={size}
      height={size}
      priority={priority}
      className={cn('shrink-0 rounded-full object-cover', className)}
    />
  );
}
