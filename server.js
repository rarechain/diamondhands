"use strict";

const QAO_ADDRESS = "0x3402e15b3ea0f1aec2679c4be4c6d051cef93953";
const { ethers } = require("ethers");
var fs = require("fs");
var jsonFile = "qao.json";
const abi = JSON.parse(fs.readFileSync(jsonFile));

module.exports = async function (fastify, opts) {
  fastify.register(require("fastify-axios"));
  const provider = new ethers.providers.JsonRpcProvider(
    "https://mainnet.infura.io/v3/3d8cb3c5014a4f6cbb8b18264a5aad1f"
  );

  const filter = {
    address: QAO_ADDRESS,
    fromBlock: "earliest",
    toBlock: "latest",
    topics: [ethers.utils.id("Transfer(address,address,uint256)")],
  };

  const contract = new ethers.Contract(QAO_ADDRESS, abi, provider);
  const iface = new ethers.utils.Interface(abi);
  fastify.get("/", async (request, reply) => {
    let res = await provider.getLogs(filter);
    res = await Promise.all(
      res.map(async (item) => {
        let _item = item;
        try {
          _item.data = iface.parseLog({
            data: item.data,
            topics: item.topics,
          });
          // _item.timestamp = (
          //   await provider.getBlock(item.blockNumber)
          // ).timestamp;
        } catch (e) {
          console.log(e);
        }
        return _item;
      })
    );
    return res;
  });
};
