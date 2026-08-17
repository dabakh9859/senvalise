import { UserPlus, UserRound, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type CustomerOption = {
    id: number;
    name: string;
    phone: string | null;
};

/**
 * Choix du client, avec recherche.
 *
 * Une liste déroulante simple suffit à dix fiches, plus du tout à cinq cents :
 * au comptoir on connaît le nom ou le numéro, pas la position dans la liste.
 * La recherche porte donc sur les deux, et sur les chiffres seuls du numéro —
 * « 77 123 45 67 » et « 771234567 » désignent la même personne.
 *
 * Écrit à la main plutôt qu'avec un composant de menu : il faut un champ de
 * saisie à l'intérieur du panneau ouvert, ce qu'un menu déroulant classique
 * n'accepte pas sans se battre avec la capture du clavier.
 */
export function ClientPicker({
    customers,
    value,
    onChange,
    onCreate,
    id,
}: {
    customers: CustomerOption[];
    /** null pour un client de passage. */
    value: number | null;
    onChange: (id: number | null) => void;
    onCreate?: (search: string) => void;
    id?: string;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const searchRef = useRef<HTMLInputElement>(null);

    const selected =
        customers.find((customer) => customer.id === value) ?? null;

    const results = useMemo(() => {
        const needle = normalise(search);

        if (needle === '') {
            return customers.slice(0, 50);
        }

        return customers
            .filter(
                (customer) =>
                    normalise(customer.name).includes(needle) ||
                    digits(customer.phone).includes(digits(search)),
            )
            .slice(0, 50);
    }, [customers, search]);

    // La remise à zéro se fait à l'ouverture, dans le gestionnaire : la
    // déclencher depuis un effet ferait un second rendu pour rien.
    function basculer() {
        if (open) {
            setOpen(false);

            return;
        }

        setSearch('');
        setOpen(true);
    }

    useEffect(() => {
        if (open) {
            searchRef.current?.focus();
        }
    }, [open]);

    return (
        <div className="relative">
            <button
                type="button"
                id={id}
                onClick={basculer}
                className="flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
                <span className="flex min-w-0 items-center gap-2">
                    <UserRound className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">
                        {selected ? selected.name : 'Client de passage'}
                    </span>
                </span>
                {selected ? (
                    <span
                        role="button"
                        tabIndex={0}
                        aria-label="Retirer le client"
                        onClick={(event) => {
                            event.stopPropagation();
                            onChange(null);
                        }}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                event.stopPropagation();
                                onChange(null);
                            }
                        }}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                    >
                        <X className="size-3.5" />
                    </span>
                ) : null}
            </button>

            {open ? (
                <>
                    {/*
                     * Voile transparent plein écran : un clic à côté referme le
                     * panneau. Sans lui, il faudrait guetter chaque clic du
                     * document et deviner ce qui appartient au composant.
                     */}
                    <button
                        type="button"
                        aria-label="Fermer la liste des clients"
                        onClick={() => setOpen(false)}
                        className="fixed inset-0 z-40 cursor-default"
                    />

                    <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
                        <div className="border-b p-2">
                            <Input
                                ref={searchRef}
                                value={search}
                                onChange={(event) =>
                                    setSearch(event.target.value)
                                }
                                placeholder="Nom ou téléphone…"
                                className="h-8"
                            />
                        </div>

                        <ul className="max-h-64 overflow-y-auto py-1">
                            <li>
                                <Choix
                                    active={value === null}
                                    onClick={() => {
                                        onChange(null);
                                        setOpen(false);
                                    }}
                                >
                                    <UserRound className="size-3.5 text-muted-foreground" />
                                    Client de passage
                                </Choix>
                            </li>

                            {results.map((customer) => (
                                <li key={customer.id}>
                                    <Choix
                                        active={customer.id === value}
                                        onClick={() => {
                                            onChange(customer.id);
                                            setOpen(false);
                                        }}
                                    >
                                        <span className="min-w-0 flex-1 truncate">
                                            {customer.name}
                                        </span>
                                        {customer.phone ? (
                                            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                                                {customer.phone}
                                            </span>
                                        ) : null}
                                    </Choix>
                                </li>
                            ))}

                            {results.length === 0 ? (
                                <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                                    Aucune fiche ne correspond.
                                </li>
                            ) : null}
                        </ul>

                        {onCreate ? (
                            <div className="border-t p-1">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="w-full justify-start"
                                    onClick={() => {
                                        setOpen(false);
                                        onCreate(search.trim());
                                    }}
                                >
                                    <UserPlus className="size-3.5" />
                                    Créer « {search.trim() || 'un client'} »
                                </Button>
                            </div>
                        ) : null}
                    </div>
                </>
            ) : null}
        </div>
    );
}

function Choix({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                active && 'bg-accent font-medium',
            )}
        >
            {children}
        </button>
    );
}

/** Compare sans accents ni casse : « Aïssatou » se trouve en tapant « aissatou ». */
function normalise(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function digits(value: string | null): string {
    return (value ?? '').replace(/\D/g, '');
}
