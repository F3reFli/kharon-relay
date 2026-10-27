/** Commande `event` : lecture de l'alerte en cours et réponse depuis le terminal. */

import { formatCost } from '../format';
import { activeEventDef, choiceCost, choiceStatus } from '../stationEvents';
import type { EventChoice, StationEventDef } from '../types';
import { line, result, type Command, type ShellContext, type TermLine } from './types';

function describeChoices(ctx: ShellContext, def: StationEventDef): TermLine[] {
  return def.choices.flatMap((choice, i) => {
    const status = choiceStatus(ctx.state, choice);
    const cost = formatCost(choiceCost(ctx.state, choice), ctx.notation);
    const price = choice.cost.length > 0 ? `  [coût : ${cost}]` : '';
    return [
      line(`  ${i + 1}. ${choice.label} (${choice.id})${price}`, status.ok ? 'ok' : 'dim'),
      line(`     ${choice.detail}${status.reason ? ` — ${status.reason}` : ''}`, 'dim'),
    ];
  });
}

function describe(ctx: ShellContext, def: StationEventDef): TermLine[] {
  const event = ctx.state.event;
  const left = event ? Math.max(0, Math.ceil(event.expiresAt - ctx.state.time)) : 0;
  const goal = def.clickGoal;
  const body: TermLine[] = goal
    ? [
        line(
          `  Objectif : ${event?.progress ?? 0}/${goal.count} impulsions manuelles (cœur ou barre d'espace).`,
          'accent',
        ),
      ]
    : [...describeChoices(ctx, def), line('Répondre : event <numéro | identifiant>', 'dim')];
  return [
    line(`◆ ${def.title} — ${def.source}`, 'title'),
    line(def.text),
    line(`Temps restant : ${left} s`, 'warn'),
    ...body,
  ];
}

function findChoice(def: StationEventDef, arg: string): EventChoice | undefined {
  const index = Number.parseInt(arg, 10);
  if (String(index) === arg) return def.choices[index - 1];
  return def.choices.find((c) => c.id === arg.toLowerCase());
}

export const eventCommand: Command = {
  name: 'event',
  usage: 'event [numéro | identifiant]',
  summary: "affiche l'événement de station en cours ou y répond",
  run: (args, ctx) => {
    const def = activeEventDef(ctx.state);
    if (!def) return result(ctx, [line('Aucun événement en cours. Capteurs en veille.', 'dim')]);
    const arg = args[0];
    if (!arg) return result(ctx, describe(ctx, def));
    if (def.choices.length === 0)
      return result(ctx, [
        line(
          "Cet événement se joue au cœur du réacteur : frappez-le, aucune réponse n'est attendue.",
          'err',
        ),
      ]);
    const choice = findChoice(def, arg);
    if (!choice) return result(ctx, [line(`event: réponse inconnue « ${arg} »`, 'err')]);
    return result(
      ctx,
      [line(`Réponse transmise : ${choice.label}.`, 'accent')],
      [{ type: 'dispatch', action: { type: 'answerEvent', choice: choice.id } }],
    );
  },
};
