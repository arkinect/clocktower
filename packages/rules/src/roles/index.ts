// Registers every role, in sheet order, and every jinx. Importing this is what puts them in play.
import { registerRole } from '../abilities/registry';
import { alHadikhia } from './al-hadikhia';
import { artist } from './artist';
import { assassin } from './assassin';
import { balloonist } from './balloonist';
import { baron } from './baron';
import { butler } from './butler';
import { cannibal } from './cannibal';
import { clockmaker } from './clockmaker';
import { damsel } from './damsel';
import { devilsAdvocate } from './devils-advocate';
import { drunk } from './drunk';
import { empath } from './empath';
import { farmer } from './farmer';
import { fisherman } from './fisherman';
import { flowergirl } from './flowergirl';
import { fool } from './fool';
import { fortuneTeller } from './fortune-teller';
import { gambler } from './gambler';
import { godfather } from './godfather';
import { golem } from './golem';
import { goon } from './goon';
import { gossip } from './gossip';
import { grandmother } from './grandmother';
import { huntsman } from './huntsman';
import { imp } from './imp';
import { innkeeper } from './innkeeper';
import { juggler } from './juggler';
import { lilMonsta } from './lil-monsta';
import { marionette } from './marionette';
import { mastermind } from './mastermind';
import { mathematician } from './mathematician';
import { mayor } from './mayor';
import { mezepheles } from './mezepheles';
import { moonchild } from './moonchild';
import { noDashii } from './no-dashii';
import { oracle } from './oracle';
import { organGrinder } from './organ-grinder';
import { philosopher } from './philosopher';
import { po } from './po';
import { poisoner } from './poisoner';
import { professor } from './professor';
import { psychopath } from './psychopath';
import { pukka } from './pukka';
import { ravenkeeper } from './ravenkeeper';
import { recluse } from './recluse';
import { sailor } from './sailor';
import { scarletWoman } from './scarlet-woman';
import { seamstress } from './seamstress';
import { shabaloth } from './shabaloth';
import { slayer } from './slayer';
import { teaLady } from './tea-lady';
import { vigormortis } from './vigormortis';
import { virgin } from './virgin';
import { witch } from './witch';
import { zealot } from './zealot';
import '../jinxes';

const SHEET = [
  clockmaker,
  sailor,
  mathematician,
  flowergirl,
  gambler,
  philosopher,
  juggler,
  fool,
  empath,
  balloonist,
  fortuneTeller,
  innkeeper,
  seamstress,
  artist,
  ravenkeeper,
  virgin,
  mayor,
  oracle,
  gossip,
  grandmother,
  huntsman,
  professor,
  slayer,
  teaLady,
  cannibal,
  farmer,
  fisherman,
  drunk,
  golem,
  recluse,
  moonchild,
  goon,
  butler,
  damsel,
  zealot,
  mezepheles,
  devilsAdvocate,
  mastermind,
  poisoner,
  marionette,
  scarletWoman,
  assassin,
  psychopath,
  godfather,
  witch,
  organGrinder,
  baron,
  imp,
  pukka,
  shabaloth,
  po,
  noDashii,
  vigormortis,
  lilMonsta,
  alHadikhia,
];

for (const role of SHEET) registerRole(role, { onDefaultScript: true });
