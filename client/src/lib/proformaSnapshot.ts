/**
 * What the pro-forma page compares to decide whether there is anything to
 * save: the form and the pro-forma's name together, so renaming alone counts.
 */
export function proformaSnapshot(form: unknown, title: string): string {
  return JSON.stringify({ form, title });
}
