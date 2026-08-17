/**
 * Mise en forme des montants, dates et nombres.
 *
 * Le franc CFA n'a pas de décimales : tous les montants circulent en entiers
 * entre le serveur et l'interface, on ne fait que les afficher joliment ici.
 */

const numberFormatter = new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 0,
});

const decimalFormatter = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

export const CURRENCY = 'FCFA';

/**
 * Espace insécable, écrit en séquence d'échappement : un caractère invisible
 * dans le code source se perd au premier copier-coller.
 */
const NBSP = ' ';

/** 45000 → « 45 000 FCFA », l'unité restant collée au montant. */
export function money(amount: number | null | undefined): string {
    return `${numberFormatter.format(amount ?? 0)}${NBSP}${CURRENCY}`;
}

/** 45000 → « 45 000 » (sans l'unité, pour les colonnes de tableau) */
export function amount(value: number | null | undefined): string {
    return numberFormatter.format(value ?? 0);
}

export function count(value: number | null | undefined): string {
    return numberFormatter.format(value ?? 0);
}

export function decimal(value: number | null | undefined): string {
    return decimalFormatter.format(value ?? 0);
}

/** 27.6 → « 27,6 % » */
export function percent(value: number | null | undefined): string {
    return `${(value ?? 0).toString().replace('.', ',')}${NBSP}%`;
}

/** Convertit une saisie libre (« 45 000 », « 45.000 FCFA ») en entier. */
export function parseAmount(value: string | number | null | undefined): number {
    if (typeof value === 'number') {
        return Math.round(value);
    }

    const digits = (value ?? '').toString().replace(/[^\d-]/g, '');

    return digits === '' || digits === '-' ? 0 : parseInt(digits, 10);
}

export function date(value: string | null | undefined): string {
    if (!value) {
        return '—';
    }

    return new Date(value).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
}

export function dateTime(value: string | null | undefined): string {
    if (!value) {
        return '—';
    }

    return new Date(value).toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/** Heure seule : « 14:30 ». Pour tout ce qui se lit à l'intérieur d'une journée. */
export function time(value: string | null | undefined): string {
    if (!value) {
        return '—';
    }

    return new Date(value).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
    });
}

/** « aujourd'hui à 14:30 », « hier à 09:12 », sinon la date complète. */
export function relativeDateTime(value: string | null | undefined): string {
    if (!value) {
        return '—';
    }

    const target = new Date(value);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const sameDay = (a: Date, b: Date) =>
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();

    const time = target.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
    });

    if (sameDay(target, today)) {
        return `aujourd'hui à ${time}`;
    }

    if (sameDay(target, yesterday)) {
        return `hier à ${time}`;
    }

    return dateTime(value);
}

/** Date du jour au format attendu par un champ <input type="date">. */
export function todayInput(): string {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;

    return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/** « valise » / « valises » selon la quantité. */
export function plural(
    value: number,
    singular: string,
    pluralForm?: string,
): string {
    return value > 1 ? (pluralForm ?? `${singular}s`) : singular;
}
