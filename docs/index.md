---
layout: home
---

<HeroRow text="Decentralized applications at the speed of light" image="images/graphic_mainframe_4.png" tagline="Canvas is a framework for realtime, peer-to-peer decentralized applications, that you can fork, remix, and extend, no blockchains required." v-bind:bullets="['Fast-sync using signed messages, libp2p, and CRDT+', 'Embeds a relational database and compute engine', 'Any chain or authentication format', 'Simple TypeScript API']">
  <HeroAction theme="brand big" text="Read the docs" href="/1-introduction" />
  <HeroAction theme="alt big" text="API Examples" href="/examples" />
</HeroRow>

<FeatureRow title="Demo">
  <FeatureCard title="MessageSync" details="Deploy simple applications like chat & copresence." />
  <FeatureCard title="TypeScript Contracts" details="Write complex application backends in TypeScript, without leaving your workflow." />
  <FeatureCard title="IPFS Contracts" details="Build immutable applications, with code and data stored on IPFS data structures."/>
</FeatureRow>

<DemoRow>
  <DemoItem title="MessageSync Demo" />
  <DemoItem title="CausalDB Demo" />
</DemoRow>

<TextRow title="About Canvas" details="Canvas is a new TypeScript runtime for decentralized applications, that's easy to learn and resembles traditional developer frameworks.">
  <TextItem prefix="Fast">Actions are processed as soon as they're seen.</TextItem>
  <TextItem prefix="Optimistic">Actions can arrive out-of-order, but CRDTs and distributed server reconciliation are used to resolve differences.</TextItem>
  <TextItem prefix="Client-first">The entire state of each application is stored inside the browser. Applications can be partitioned so clients only sync data they're interested in.</TextItem>
  <TextItem prefix="Bring your own finality">The default engine doesn't implement a finality mechanism, but you can add your own with timestamping or DA layers.</TextItem>
</TextRow>

<FeatureRow title="Logins">
  <FeatureCard title="Sign in with Wallet" details="Log in with a Web3 wallet from Ethereum. Also supports other chains like Cosmos, Solana, and Polkadot." linkText="Available today" />
  <FeatureCard title="Sign in with OpenID" details="Log in trustlessly with Google, Apple, or other SSO providers. Powered by zero-knowledge proofs." soon="Coming soon"/>
  <FeatureCard title="Sign in with Bluesky" details="Log in with your decentralized identity from the Bluesky PLC network." soon="Coming soon"/>
</FeatureRow>

<FeatureRow title="Technical Components">
  <FeatureCard title="Okra" details="A deterministic Prolly-tree that allows fast syncing between unordered sets of actions." link="https://github.com/canvasxyz/okra" linkText="Github" secondaryLink="https://joelgustafson.com/posts/2023-05-04/merklizing-the-key-value-store-for-fun-and-profit" secondaryLinkText="Blog Post"/>
  <FeatureCard title="GossipLog" details="A history-preserving log that allows CRDT functions to retrieve data from the past." link="https://github.com/canvasxyz/canvas/tree/main/packages/gossiplog"/>
  <FeatureCard title="ModelDB" details="A database abstraction layer over IndexedDB and SQLite, that runs in both the browser and server." link="https://github.com/canvasxyz/canvas/tree/main/packages/modeldb"/>
</FeatureRow>

<HomepageFooter />