export function Icon({ children }: {
  children: string;
}) {
  return <span className="icon" aria-hidden="true">{children}</span>;
}
