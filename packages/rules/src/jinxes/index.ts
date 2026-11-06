// The jinxes between roles in the app, in one file each. Checked 2026-11-01 against the Djinn page and each role's page.
import { registerJinx } from '../abilities/registry';
import { alHadikhiaMastermind } from './al-hadikhia-mastermind';
import { butlerOrganGrinder } from './butler-organ-grinder';
import { cannibalButler } from './cannibal-butler';
import { cannibalJuggler } from './cannibal-juggler';
import { cannibalZealot } from './cannibal-zealot';
import { lilMonstaPsychopath } from './lil-monsta-psychopath';
import { lilMonstaScarletWoman } from './lil-monsta-scarlet-woman';
import { marionetteBalloonist } from './marionette-balloonist';
import { marionetteHuntsman } from './marionette-huntsman';
import { marionetteLilMonsta } from './marionette-lil-monsta';
import { mastermindVigormortis } from './mastermind-vigormortis';
import { mathematicianDrunk } from './mathematician-drunk';
import { mathematicianMarionette } from './mathematician-marionette';
import { scarletWomanAlHadikhia } from './scarlet-woman-al-hadikhia';

for (const jinx of [
  mathematicianDrunk,
  mathematicianMarionette,
  marionetteBalloonist,
  marionetteHuntsman,
  marionetteLilMonsta,
  mastermindVigormortis,
  lilMonstaPsychopath,
  butlerOrganGrinder,
  cannibalButler,
  cannibalZealot,
  cannibalJuggler,
  lilMonstaScarletWoman,
  scarletWomanAlHadikhia,
  alHadikhiaMastermind,
]) {
  registerJinx(jinx);
}
