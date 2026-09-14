"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export function HeaderBackButton() {
  const router = useRouter();

  function goBack() {
    router.push("/");
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      className="ml-2 rounded-sm border-border-subtle bg-background/80"
      aria-label="Voltar para a página anterior"
      title="Voltar"
      onClick={goBack}
    >
      <ArrowLeft className="size-4" />
    </Button>
  );
}
