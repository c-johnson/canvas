import 'ses';
import fs from 'fs';
import axios from 'axios';
import express from 'express';
import bodyParser from 'body-parser';
import { Loader } from './loader.js';

const USAGE = `Prologue: everlasting decentralized applications, built on signed messages

$ node prologue.js [spec]

  Prologue accepts specs in a few formats:
   test.prologue.js         Local spec.
   /ipfs/Qm...              Loads a spec from IPFS. This runs arbitrary code! (V2)

  Optional arguments:
   --reset-database         Resets the database, and then quits.    (TODO)
   --verbose                Prints SQL debug output to console.     (TODO: knex debug=true)

  To upload a local spec to ipfs, run 'ipfs add test.prologue.js'.
`;

const quit = (msg) => {
  if (msg) {
    console.error(msg);
  }
  console.log(USAGE);
  process.exit(1);
}

if (process.argv.length < 3) {
  quit();
}

const optionalArgs = process.argv.slice(2, process.argv.length - 1);
optionalArgs.forEach((oarg) => {
  if (!['--reset-database', '--verbose'].includes(oarg)) {
    quit('Invalid argument: ' + oarg);
  }
});
const specArg = process.argv[process.argv.length - 1];

if (specArg.startsWith('-')) {
  quit("Must provide a valid spec filename!");
} else if (specArg.startsWith('/ipfs/')) {
  quit("IPFS not supported yet!");
} else if (specArg.startsWith('/ipns/')) {
  quit("IPNS not supported yet!");
}

const file = fs.readFile(process.argv[process.argv.length - 1], 'utf8', (err, spec) => {
  if (err) {
    return quit("Spec file not found, or could not be read");
  }

  // See https://github.com/endojs/endo/tree/master/packages/ses
  //
  // Lock down globals, then inject the loader into a new compartment
  // and execute the spec to get sandboxed execution. The SES
  // compartment means that the spec is executed in an environment
  // with its own globals.
  //
  // Later we should use Deno or OS-level VMs to gain more security.
  lockdown();
  const app = express();
  app.use(bodyParser.json());
  const loader = new Loader(app);
  const c = new Compartment({
    prologue: loader,
    // TODO(v1): these objects aren't hardened. We should refactor to only
    // expose a bidirectional message-passing interface to the spec,
    // for accessing or calling models, views, and action functions.
  });
  c.evaluate(spec);

  loader.syncDB().then(async (loader) => {

    loader.server().listen(3000, async () => {
      console.log('Server listening on port 3000');

      const pollId = (await axios.post('http://localhost:3000/action/createPoll', { title: 'Should Verses adopt a motto?' })).data.id;
      const cardId1 = (await axios.post('http://localhost:3000/action/createCard', { pollId, text: 'Yes, we should vote on one now' })).data.id;
      const cardId2 = (await axios.post('http://localhost:3000/action/createCard', { pollId, text: 'Yes, with modifications to the question' })).data.id;
      const cardId3 = (await axios.post('http://localhost:3000/action/createCard', { pollId, text: 'No, we should leave it open' })).data.id;
      await axios.post('http://localhost:3000/action/createVote', { cardId: cardId1, value: false });
      await axios.post('http://localhost:3000/action/createVote', { cardId: cardId1, value: true });

      await axios.get('http://localhost:3000/polls').then((({ data }) => {
        console.log(data);
      }));
      await axios.get(`http://localhost:3000/polls/${pollId}`).then((({ data }) => {
        console.log(data);
      }));

    });
  });
});
