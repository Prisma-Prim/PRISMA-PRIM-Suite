/**
 * The name the Clarté interface gives a screen the current interface names
 * differently (#1581): its Documents tabs are Register and Knowledge base.
 * App-level tests shared by both interfaces translate the current name when
 * they reach a screen through the Clarté menu or jump list.
 */
export function clarteScreenName(currentName: string) {
  if (currentName === 'Working Documents') return 'Register';
  if (currentName === 'Knowledge evidence') return 'Knowledge base';
  return currentName;
}
