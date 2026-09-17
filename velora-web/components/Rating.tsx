interface Props {
  rating: number;
  reviewCount: number;
  size?: 'sm' | 'md';
}

export const Rating: React.FC<Props> = ({ rating, reviewCount, size = 'sm' }) => {
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';
  return (
    <div className={`flex items-center gap-1 ${textSize} text-neutral-600`}>
      <span className="text-amber-500" aria-hidden>
        ★
      </span>
      <span className="font-semibold text-neutral-900">{rating > 0 ? rating.toFixed(1) : 'New'}</span>
      {reviewCount > 0 ? <span>({reviewCount})</span> : null}
    </div>
  );
};
