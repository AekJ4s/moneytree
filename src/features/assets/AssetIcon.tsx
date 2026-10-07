import { useAsync } from '../../lib/useAsync';
import { signLogoUrls } from '../debts/api';
import { ASSET_KINDS, type Asset } from './types';

/** An icon value is a stored image when it is a storage path ("<uid>/assets/x.webp") or a bundled one ("/x.webp"). */
export function isImageIcon(icon: string | null | undefined): icon is string {
  return !!icon && icon.includes('/');
}

/** Signed URLs for assets whose icon is an uploaded picture. */
export function useAssetImages(assets: Pick<Asset, 'icon'>[]): Record<string, string> {
  const stored = assets.map((a) => a.icon).filter((i): i is string => isImageIcon(i) && !i.startsWith('/'));
  const signed = useAsync(() => signLogoUrls(stored), [stored.join('|')]);
  return signed.data ?? {};
}

const SIZE = { sm: 'h-8 w-8 text-lg', md: 'h-12 w-12 text-2xl' } as const;

export function AssetIcon({
  asset,
  images,
  size = 'md',
}: {
  asset: Pick<Asset, 'icon' | 'kind' | 'name'>;
  images: Record<string, string>;
  size?: keyof typeof SIZE;
}) {
  const icon = asset.icon;
  const src = isImageIcon(icon) ? (icon.startsWith('/') ? icon : images[icon]) : undefined;
  return (
    <div className={`${SIZE[size]} flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-amber-50`}>
      {src ? (
        <img src={src} alt={asset.name} className="h-full w-full object-cover" />
      ) : isImageIcon(icon) ? (
        <span className="h-full w-full animate-pulse bg-amber-100" />
      ) : (
        icon || ASSET_KINDS[asset.kind].icon
      )}
    </div>
  );
}
