import { Link, router } from '@inertiajs/react';
import type { ReactNode } from 'react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

export type Column<T> = {
    /** Sert aussi de clé React : unique dans le tableau. */
    key: string;
    header: ReactNode;
    cell: (row: T) => ReactNode;
    align?: 'left' | 'right';
    /**
     * Colonne réservée aux grands écrans. Sur une tablette large on garde
     * l'essentiel ; le détail réapparaît à partir de `xl`.
     */
    hideBelow?: 'xl';
    className?: string;
    headClassName?: string;
};

/**
 * Une liste, deux formes.
 *
 * En dessous de 1024 px — téléphone, tablette en portrait — un tableau de sept
 * colonnes se lit à la loupe ou déborde. La même donnée devient une tuile :
 * un titre, une ligne de contexte, le chiffre qui compte. Au-delà, le tableau
 * reprend sa place, avec ses colonnes secondaires masquées jusqu'à `xl`.
 *
 * Les deux rendus sont dans le DOM et l'un est masqué en CSS : basculer en
 * JavaScript sur la largeur ferait clignoter la liste au chargement et au
 * changement d'orientation.
 */
export function DataList<T>({
    rows,
    getKey,
    columns,
    tile,
    tileHref,
    empty,
    footer,
    className,
}: {
    rows: T[];
    getKey: (row: T) => string | number;
    columns: Array<Column<T>>;
    /** Contenu de la tuile sur téléphone et tablette. */
    tile: (row: T) => ReactNode;
    /**
     * Rend la ligne entière cliquable, en tuile comme en tableau.
     *
     * Le nom dit « tile » pour des raisons d'histoire : au départ seule la
     * tuile mobile en tenait compte, et les tableaux n'avaient aucune cible de
     * clic en dehors du lien posé dans la première cellule.
     */
    tileHref?: (row: T) => string | null;
    empty?: ReactNode;
    footer?: ReactNode;
    className?: string;
}) {
    if (rows.length === 0) {
        return (
            <div
                className={cn('rounded-xl border bg-card shadow-sm', className)}
            >
                {empty}
                {footer ? <div className="px-4 pb-3">{footer}</div> : null}
            </div>
        );
    }

    return (
        <div className={cn('rounded-xl border bg-card shadow-sm', className)}>
            {/* Tuiles — téléphone et tablette */}
            <ul className="divide-y lg:hidden">
                {rows.map((row) => {
                    const href = tileHref?.(row) ?? null;
                    const content = tile(row);

                    return (
                        <li key={getKey(row)} className="anim-entree">
                            {href ? (
                                <Link
                                    href={href}
                                    // 44 px de haut au minimum : c'est la taille
                                    // d'un doigt, pas celle d'un curseur.
                                    className="block min-h-11 px-4 py-3 transition-colors duration-150 active:bg-accent"
                                >
                                    {content}
                                </Link>
                            ) : (
                                <div className="px-4 py-3">{content}</div>
                            )}
                        </li>
                    );
                })}
            </ul>

            {/* Tableau — ordinateur */}
            <div className="hidden lg:block">
                <Table>
                    <TableHeader>
                        <TableRow>
                            {columns.map((column) => (
                                <TableHead
                                    key={column.key}
                                    className={cn(
                                        column.align === 'right' &&
                                            'text-right',
                                        column.hideBelow === 'xl' &&
                                            'hidden xl:table-cell',
                                        column.headClassName,
                                    )}
                                >
                                    {column.header}
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((row) => {
                            const href = tileHref?.(row) ?? null;

                            return (
                                <TableRow
                                    key={getKey(row)}
                                    className={cn(href && 'cursor-pointer')}
                                    onClick={
                                        href
                                            ? (event) => {
                                                  /*
                                                   * Un clic posé sur un bouton, un
                                                   * lien ou un champ appartient à
                                                   * cet élément : la ligne ne le
                                                   * lui prend pas. Sans ce garde,
                                                   * supprimer une fiche ouvrirait
                                                   * la fiche au lieu de la
                                                   * supprimer.
                                                   */
                                                  const cible =
                                                      event.target as HTMLElement;

                                                  if (
                                                      cible.closest(
                                                          'a, button, input, select, textarea, [role="button"]',
                                                      )
                                                  ) {
                                                      return;
                                                  }

                                                  /*
                                                   * Sélectionner un numéro de
                                                   * téléphone pour le copier
                                                   * finit par un relâchement de
                                                   * souris sur la ligne : sans
                                                   * ce garde, la page changerait
                                                   * au moment de copier.
                                                   */
                                                  if (
                                                      window
                                                          .getSelection()
                                                          ?.toString()
                                                  ) {
                                                      return;
                                                  }

                                                  router.visit(href);
                                              }
                                            : undefined
                                    }
                                >
                                    {columns.map((column) => (
                                        <TableCell
                                            key={column.key}
                                            className={cn(
                                                column.align === 'right' &&
                                                    'text-right tabular-nums',
                                                column.hideBelow === 'xl' &&
                                                    'hidden xl:table-cell',
                                                column.className,
                                            )}
                                        >
                                            {column.cell(row)}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>

            {footer ? <div className="px-4 pb-3">{footer}</div> : null}
        </div>
    );
}

/**
 * Une ligne de tuile : libellé à gauche, valeur à droite.
 * De quoi composer une tuile sans réinventer l'alignement à chaque page.
 */
export function TileRow({
    label,
    children,
    className,
}: {
    label: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                'flex items-baseline justify-between gap-3 text-xs',
                className,
            )}
        >
            <span className="text-muted-foreground">{label}</span>
            <span className="text-right tabular-nums">{children}</span>
        </div>
    );
}

/** En-tête de tuile : titre à gauche, chiffre ou statut à droite. */
export function TileHeader({
    title,
    subtitle,
    trailing,
}: {
    title: ReactNode;
    subtitle?: ReactNode;
    trailing?: ReactNode;
}) {
    return (
        <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
                <p className="truncate text-sm font-medium">{title}</p>
                {subtitle ? (
                    <p className="truncate text-xs text-muted-foreground">
                        {subtitle}
                    </p>
                ) : null}
            </div>
            {trailing ? (
                <div className="shrink-0 text-right">{trailing}</div>
            ) : null}
        </div>
    );
}
