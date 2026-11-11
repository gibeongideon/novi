import { useCompanies } from "@novi/engine";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  useT,
} from "@novi/ui";
import { Building2, ChevronsUpDown } from "lucide-react";

/** Active company (P1.12.2). Hidden when the user has only one company. */
export function CompanySwitcher() {
  const t = useT();
  const { companies, active, setActive } = useCompanies();
  if (companies.length < 2) return null;
  const current = companies.find((c) => c.id === active[0]);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`${t("switchCompany")}: ${current?.name ?? ""}`}
          className="max-w-56"
        >
          <Building2 aria-hidden />
          <span className="hidden truncate sm:inline">{current?.name}</span>
          <ChevronsUpDown aria-hidden className="text-text-muted" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t("company")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={String(active[0])} onValueChange={(v) => setActive([Number(v)])}>
          {companies.map((c) => (
            <DropdownMenuRadioItem key={c.id} value={String(c.id)}>
              {c.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
