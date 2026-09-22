import { seedSeasonEndFixture } from "./season-end-fixture";

seedSeasonEndFixture().catch((error) => {
  console.error(error);
  process.exit(1);
});
