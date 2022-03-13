const QAO_ADDRESS = "0x3402e15b3ea0f1aec2679c4be4c6d051cef93953";
const { ethers } = require("ethers");
var fs = require("fs");
var jsonFile = "qao.json";
const abi = JSON.parse(fs.readFileSync(jsonFile));
const Moralis = require("moralis/node");
const { Contract, Provider } = require("ethers-multicall");
require("dotenv").config();

module.exports = async function (fastify, opts) {
  fastify.register(require("fastify-axios"));
  const provider = new ethers.providers.JsonRpcProvider(
    "https://speedy-nodes-nyc.moralis.io/057bf05e3dad4457750854a1/eth/mainnet"
  );

  const serverUrl = process.env.MORALIS_SERVER_URL;
  const appId = process.env.MORALIS_APP_ID;
  Moralis.start({ serverUrl, appId });
  const QAOTransfer = Moralis.Object.extend("QAOTransferA");
  const query = new Moralis.Query(QAOTransfer);
  query.ascending("block_number");
  query.limit(10000);

  const ethcallProvider = new Provider(provider);
  await ethcallProvider.init();
  const contract = new Contract(QAO_ADDRESS, abi);

  fastify.get("/out-ratios", async (request, reply) => {
    let transferTxns = await query.find();
    const filteredTransferTxns = transferTxns
      .filter((txn) => {
        return (
          txn.toJSON().from !== "0x0000000000000000000000000000000000000000" &&
          txn.toJSON().to !== "0x0000000000000000000000000000000000000000" &&
          txn.toJSON().from !== "0x000000000000000000000000000000000000dead" &&
          txn.toJSON().to !== "0x000000000000000000000000000000000000dead" &&
          txn.toJSON().from !== "0x053b759c880b69075a52e4374efa08e6b5196ad0" &&
          txn.toJSON().to !== "0x053b759c880b69075a52e4374efa08e6b5196ad0"
        );
      })
      .map((txn) => txn.toJSON());

    const outTransfers = {};
    filteredTransferTxns.map((txn) => {
      if (typeof outTransfers[txn.from] === "undefined")
        outTransfers[txn.from] = ethers.BigNumber.from(0);

      outTransfers[txn.from] = outTransfers[txn.from].add(
        ethers.BigNumber.from(txn.value)
      );
    });

    const outRatios = {};

    const contractCalls = Object.keys(outTransfers).map((key) =>
      contract.balanceOf(key)
    );
    const balances = await ethcallProvider.all(contractCalls);
    Object.keys(outTransfers).map(async (key, idx) => {
      if (!balances[idx].isZero())
        outRatios[key] = outTransfers[key].div(balances[idx]).toString();
    });

    return {
      "out vs balance ratio": Object.fromEntries(
        Object.entries(outRatios).sort(([, a], [, b]) => a - b)
      ),
    };
  });

  fastify.get("/in-ratios", async (request, reply) => {
    let transferTxns = await query.find();
    const filteredTransferTxns = transferTxns
      .filter((txn) => {
        return (
          txn.toJSON().from !== "0x0000000000000000000000000000000000000000" &&
          txn.toJSON().to !== "0x0000000000000000000000000000000000000000" &&
          txn.toJSON().from !== "0x000000000000000000000000000000000000dead" &&
          txn.toJSON().to !== "0x000000000000000000000000000000000000dead" &&
          txn.toJSON().from !== "0x053b759c880b69075a52e4374efa08e6b5196ad0" &&
          txn.toJSON().to !== "0x053b759c880b69075a52e4374efa08e6b5196ad0"
        );
      })
      .map((txn) => txn.toJSON());

    const inTransfers = {};

    filteredTransferTxns.map((txn) => {
      if (typeof inTransfers[txn.to] === "undefined")
        inTransfers[txn.to] = ethers.BigNumber.from(0);

      inTransfers[txn.to] = inTransfers[txn.to].add(
        ethers.BigNumber.from(txn.value)
      );
    });

    const inRatios = {};

    const contractCalls = Object.keys(inTransfers).map((key) =>
      contract.balanceOf(key)
    );
    const balances = await ethcallProvider.all(contractCalls);

    Object.keys(inTransfers).map(async (key, idx) => {
      if (!balances[idx].isZero())
        inRatios[key] = inTransfers[key].div(balances[idx]).toString();
    });

    return {
      "in vs balance ratio": Object.fromEntries(
        Object.entries(inRatios).sort(([, a], [, b]) => a - b)
      ),
    };
  });

  fastify.get("/holding-days", async (request, reply) => {
    let transferTxns = await query.find();
    const filteredTransferTxns = transferTxns
      .filter((txn) => {
        return (
          txn.toJSON().from !== "0x0000000000000000000000000000000000000000" &&
          txn.toJSON().to !== "0x0000000000000000000000000000000000000000" &&
          txn.toJSON().from !== "0x000000000000000000000000000000000000dead" &&
          txn.toJSON().to !== "0x000000000000000000000000000000000000dead" &&
          txn.toJSON().from !== "0x053b759c880b69075a52e4374efa08e6b5196ad0" &&
          txn.toJSON().to !== "0x053b759c880b69075a52e4374efa08e6b5196ad0"
        );
      })
      .map((txn) => txn.toJSON());

    const holdingData = {};
    filteredTransferTxns.map((txn) => {
      if (typeof holdingData[txn.from] === "undefined") {
        holdingData[txn.from] = {
          balance: ethers.BigNumber.from(0),
          date: "",
          logs: [],
        };
      }
      if (typeof holdingData[txn.to] === "undefined") {
        holdingData[txn.to] = {
          balance: ethers.BigNumber.from(0),
          date: "",
          logs: [],
        };
      }
      if (holdingData[txn.from].date && !holdingData[txn.from].balance.isZero())
        holdingData[txn.from].logs.push({
          amount: holdingData[txn.from].balance.toString(),
          days:
            (new Date(Date.parse(txn.block_timestamp.iso)) -
              new Date(Date.parse(holdingData[txn.from].date))) /
            (1000 * 60 * 60 * 24),
        });

      if (holdingData[txn.to].date && !holdingData[txn.to].balance.isZero())
        holdingData[txn.to].logs.push({
          amount: holdingData[txn.to].balance.toString(),
          days:
            (new Date(Date.parse(txn.block_timestamp.iso)) -
              new Date(Date.parse(holdingData[txn.to].date))) /
            (1000 * 60 * 60 * 24),
        });

      holdingData[txn.from].balance = holdingData[txn.from].balance.sub(
        ethers.BigNumber.from(txn.value)
      );
      holdingData[txn.to].balance = holdingData[txn.to].balance.add(
        ethers.BigNumber.from(txn.value)
      );

      holdingData[txn.from].date = txn.block_timestamp.iso;
      holdingData[txn.to].date = txn.block_timestamp.iso;
    });

    return holdingData;
  });

  fastify.get("/in-out-ratios", async (request, reply) => {
    let transferTxns = await query.find();
    const filteredTransferTxns = transferTxns
      .filter((txn) => {
        return (
          txn.toJSON().from !== "0x0000000000000000000000000000000000000000" &&
          txn.toJSON().to !== "0x0000000000000000000000000000000000000000" &&
          txn.toJSON().from !== "0x000000000000000000000000000000000000dead" &&
          txn.toJSON().to !== "0x000000000000000000000000000000000000dead" &&
          txn.toJSON().from !== "0x053b759c880b69075a52e4374efa08e6b5196ad0" && // stake pool
          txn.toJSON().to !== "0x053b759c880b69075a52e4374efa08e6b5196ad0" &&
          txn.toJSON().from !== "0x364c90218f6664f6c8b154ad9c3e31947cd3640c" && // Uniswap pool
          txn.toJSON().to !== "0x364c90218f6664f6c8b154ad9c3e31947cd3640c" &&
          txn.toJSON().from !== "0xA0c68C638235ee32657e8f720a23ceC1bFc77C77" && // Bridge
          txn.toJSON().to !== "0xA0c68C638235ee32657e8f720a23ceC1bFc77C77"
        );
      })
      .map((txn) => txn.toJSON());

    const transfers = {};

    filteredTransferTxns.map((txn) => {
      if (typeof transfers[txn.from] === "undefined") {
        transfers[txn.from] = {
          in: ethers.BigNumber.from(0),
          out: ethers.BigNumber.from(0),
          senders: new Set(),
        };
      }

      if (typeof transfers[txn.to] === "undefined") {
        transfers[txn.to] = {
          in: ethers.BigNumber.from(0),
          out: ethers.BigNumber.from(0),
          senders: new Set(),
        };
      }

      transfers[txn.from].out = transfers[txn.from].out.add(
        ethers.BigNumber.from(txn.value)
      );
      transfers[txn.to].in = transfers[txn.to].in.add(
        ethers.BigNumber.from(txn.value)
      );
      transfers[txn.to].senders.add(txn.from);
    });

    const inOutRatios = {};

    const contractCalls = Object.keys(transfers).map((key) =>
      contract.balanceOf(key)
    );
    const balances = await ethcallProvider.all(contractCalls);

    Object.keys(transfers).map(async (key, idx) => {
      if (typeof inOutRatios[key] === "undefined") {
        inOutRatios[key] = {
          value: "0",
          senders: [],
        };
      }
      if (!balances[idx].isZero()) {
        if (transfers[key].out.isZero()) {
          inOutRatios[key].value = "99999999";
          inOutRatios[key].senders = Array.from(transfers[key].senders);
          console.log(inOutRatios[key].senders);
        } else {
          const tmp = ethers.FixedNumber.from(transfers[key].in).divUnsafe(
            ethers.FixedNumber.from(transfers[key].out)
          );

          inOutRatios[key].value = tmp.toString();
        }
      }
    });

    return {
      "in vs out ratio": Object.fromEntries(
        Object.entries(inOutRatios).sort(([, a], [, b]) => a.value - b.value)
      ),
    };
  });
};
