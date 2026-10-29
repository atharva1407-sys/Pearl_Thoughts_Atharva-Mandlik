import Image from "next/image";

export function Logo({ size = "md" }: { size?: "sm" | "md" }) {
  const px = size === "md" ? 34 : 30;
  return (
    <span className="flex items-center gap-2">
      <Image src="/images/medrella-logo.png" alt="" width={px} height={px} priority={size === "md"} />
      <span className={`font-bold tracking-tight text-[#14243d] ${size === "md" ? "text-[21px]" : "text-lg"}`}>
        medrella<span className="text-[#1769e8]">.</span>
      </span>
    </span>
  );
}
