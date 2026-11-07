// StrykerJS config of the allowlisted module named by MUTATION_MODULE, run
// from that module's package (see scripts/weekly-mutation.mjs).
import { strykerConfig } from '../weekly-mutation.mjs';

export default strykerConfig(process.env.MUTATION_MODULE);
