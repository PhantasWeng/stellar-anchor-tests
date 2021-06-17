import { useRef, useEffect, useState } from "react";
import {
  Button,
  InfoBlock,
  Input,
  Select,
} from "@stellar/design-system";
import throttle from "lodash.throttle";
import { StellarTomlResolver } from "stellar-sdk";

import { socket } from "helpers/socketConnection";
import { getSupportedAssets } from "helpers/utils";
import { TestCases, TestCase, parseTests, getTestRunId } from "../TestCases"
import "./styles.scss";

// SEPs to send to server based on SEP selected in dropdown
const DROPDOWN_SEPS_MAP: Record<number, Array<number>> = {
  1: [1],
  6: [1, 10, 12, 6],
  10: [1, 10],
  12: [1, 10, 12],
  24: [1, 10, 24],
  31: [1, 10, 12, 31]
};
// SEPs that require the config file field to be rendered in UI
const CONFIG_SEPS = [6, 12, 31];
// SEPs that require an asset to use in tests
const TRANSFER_SEPS = [6, 24, 31];

interface FormData {
  homeDomain: string;
  seps: Array<number>;
  assetCode?: string;
  sepConfig?: any
}

enum RunState {
  noTests = "noTests",
  awaitingRun = "awaitingRun",
  running = "running",
  done = "done"
}

export const TestRunner = () => {
  const [formData, setFormData] = useState({
    homeDomain: "",
    seps: [],
  } as FormData);
  const [serverFailure, setServerFailure] = useState("");
  const [isConfigNeeded, setIsConfigNeeded] = useState(false);
  const [testRunArray, setTestRunArray] = useState([] as TestCase[]); 
  const [testRunOrderMap, setTestRunOrderMap] = useState({} as Record<string, number>);
  const [runState, setRunState] = useState(RunState.noTests);
  const [toml, setToml] = useState(undefined as undefined | { [key in string]: string });
  const [supportedAssets, setSupportedAssets] = useState([] as string[]);
  const [supportedSeps, setSupportedSeps] = useState([] as number[]);

  function resetAllState() {
    setRunState(RunState.noTests);
    setServerFailure("");
    setIsConfigNeeded(false);
    setSupportedAssets([]);
    setSupportedSeps([]);
    setToml(undefined);
    setTestRunArray([]);
    setTestRunOrderMap({});
    setFormData({ homeDomain: "", seps: [] });
  }

  // add/remove websocket listener for getTests on component mount/dismount
  useEffect(() => {
    socket.on("getTests", (tests) => {
      const testRunOrderMap: Record<string, number> = {};
      const testRuns = parseTests(tests);
      let i = 0;
      for (const testRun of testRuns)
        testRunOrderMap[getTestRunId(testRun.test)] = i++;
      setTestRunOrderMap(testRunOrderMap);
      setTestRunArray(testRuns);
      setRunState(RunState.awaitingRun);
    });
    return () => {
      socket.off("getTests");
    };
  }, []);

  // add/remove websocket listener for runTests on component mount/dismount
  useEffect(() => {
    socket.on("runTests", ({ test, result }) => {
      const testRunArrayCopy = [...testRunArray];
      const testRun = testRunArrayCopy[testRunOrderMap[getTestRunId(test)]];
      testRun.result = result;
      setTestRunArray(testRunArrayCopy);
      if (testRunArrayCopy.every((testRun => testRun.result))) {
        setRunState(RunState.done);
      } 
    });
    return () => {
      socket.off("runTests");
    };
  }, [testRunArray, testRunOrderMap]);

  // make getTests request at most once every 250 milliseconds
  const getTestsThrottled = useRef(
    throttle((newFormData) => {
      socket.emit("getTests", newFormData, (error: Error) => {
        setServerFailure(
          `server failure occurred: ${error.name}: ${error.message}`
        );
      });
    }, 250)
  );

  // make toml requests at most once every 250 milliseconds
  const getTomlThrottled = useRef(
    throttle(async (homeDomain) => {
      const homeDomainHost = new URL(homeDomain).host;
      let tomlObj;
      try {
        tomlObj = await StellarTomlResolver.resolve(homeDomainHost);
      } catch {
        resetAllState();
        setServerFailure("Unable to fetch SEP-1 stellar.toml file");
        return;
      }
      setServerFailure("");
      setToml(tomlObj);
      //updateNetworkState(tomlObj.NETWORK_PASSPHRASE);
      updateSupportedSepsState(tomlObj);
      return tomlObj;
    }, 250)
  );

  const getSupportedAssetsRef = useRef(
    throttle(async (domain: string, sep: number) => {
      setSupportedAssets(await getSupportedAssets(domain, sep));
    }, 250)
  );

  // onClick handler for 'Run Tests' button
  const handleSubmit = () => {
    clearTestResults();
    setRunState(RunState.running);
    socket.emit("runTests", formData, (error: Error) => {
      setServerFailure(
        `server failure occurred: ${error.name}: ${error.message}`
      );
    });
  };

  // onClick handler for 'Reset' button
  const clearTestResults = () => {
    const testRunArrayCopy = [...testRunArray];
    for (const testRun of testRunArrayCopy) {
      testRun.result = undefined;
    }
    setTestRunArray(testRunArrayCopy);
    setRunState(RunState.awaitingRun);
  };

  /*const updateNetworkState = (network: string | undefined) => {
    if (network) {
      if (Networks.TESTNET === network) {
        setIsTestnet(true);
      } else if (Networks.PUBLIC === network) {
        setIsTestnet(false);
      } else {
        setIsTestnet(undefined);
      }
    } else {
      setIsTestnet(undefined);
    }
  }*/

  const updateSupportedSepsState = (tomlObj: { [key: string]: string }) => {
    if (tomlObj) {
      const newSupportedSeps = [1];
      if (tomlObj.TRANSFER_SERVER) {
        newSupportedSeps.push(6);
      }
      if (tomlObj.WEB_AUTH_ENDPOINT) {
        newSupportedSeps.push(10);
      }
      if (tomlObj.KYC_SERVER) {
        newSupportedSeps.push(12);
      }
      if (tomlObj.TRANSFER_SERVER_SEP0024) {
        newSupportedSeps.push(24);
      }
      if (tomlObj.DIRECT_PAYMENT_SERVER) {
        newSupportedSeps.push(31);
      }
      setSupportedSeps(newSupportedSeps);
    } else {
      setSupportedSeps([]);
    }
  }

  const handleHomeDomainChange = async (value: string) => {
    if (!value) {
      resetAllState();
      return;
    }
    if (!value.startsWith("http")) {
      value = "https://" + value;
    }
    await getTomlThrottled.current(value);
    setFormData({
      ...formData,
      homeDomain: value
    });
  };

  const updateSupportedAssetsState = async (sep: number | undefined) => {
    if (!sep || !TRANSFER_SEPS.includes(sep)) {
      setSupportedAssets([]);
      return;
    }
    const tomlAttribute = {
      6: "TRANSFER_SERVER",
      24: "TRANSFER_SERVER_SEP0024",
      31: "DIRECT_PAYMENT_SERVER"
    }[sep];
    if (!toml || !toml[tomlAttribute as string]) {
      setServerFailure(
        `The SEP-1 stellar.toml file has no ${tomlAttribute}.`
      );
      setSupportedAssets([]);
      return;
    }
    await getSupportedAssetsRef.current(
      toml[tomlAttribute as string], sep
    )
  }

  const handleSepChange = async (value: string) => {
    const sepNumber = value ? Number(value) : undefined;

    // retain config only if it is still needed
    let configValue; 
    if (sepNumber && CONFIG_SEPS.includes(sepNumber)) {
      setIsConfigNeeded(true);
      configValue = formData.sepConfig;
    } else {
      setIsConfigNeeded(false);
      configValue = undefined;
    }

    const newFormData = {
      ...formData,
      sepConfig: configValue,
      seps: sepNumber ? DROPDOWN_SEPS_MAP[sepNumber] : []
    };

    if (!sepNumber) {
      setTestRunArray([]);
      setTestRunOrderMap({});
    } else {
      getTestsThrottled.current(newFormData);
    }

    await updateSupportedAssetsState(sepNumber);
    setFormData(newFormData);
  };

  const handleAssetCodeChange = (value: string) => {
    setFormData({
      ...formData,
      assetCode: value
    })
  };

  const handleFileChange = (files: FileList | null) => {
    if (files?.length) {
      const fileReader = new FileReader();
      fileReader.readAsText(files[0], "UTF-8");
      fileReader.onload = (e) => {
        setFormData({
          ...formData,
          sepConfig: JSON.parse(e?.target?.result as string),
        });
      };
    }
  };

  return (
    <>
      <div className="TestConfigWrapper">
        <Input
          id="homeDomain"
          label="Home Domain"
          onChange={(e) => handleHomeDomainChange(e.target.value)}
        />
        { supportedSeps.length !== 0 && 
          <Select id="seps" label="sep" onChange={(e) => handleSepChange(e.target.value)}>
            <option></option>
            { supportedSeps.map((sepNum) => (
              <option key={sepNum} value={String(sepNum)}>
                SEP-{sepNum}
              </option>
            )) }
          </Select>
        }
        { supportedAssets.length !== 0 && 
          <Select id="assetCode" label="Asset" onChange={(e) => handleAssetCodeChange(e.target.value)}>
            {supportedAssets.map(assetCode => (
              <option key={assetCode} value={assetCode}>{assetCode}</option>
            ))}          
          </Select> 
        }
        {isConfigNeeded && (
          <div className="ButtonWrapper">
            <Input
              id="sepConfig"
              label="Upload Config"
              onChange={(e) => handleFileChange(e.target.files)}
              type="file"
            />
          </div>
        )}
        {serverFailure && (
          <InfoBlock variant={InfoBlock.variant.error}>
            {serverFailure}
          </InfoBlock>
        )}
        <div className="ButtonWrapper">
          <Button onClick={handleSubmit} disabled={ [RunState.running, RunState.noTests].includes(runState) || Boolean(serverFailure) }>
            { (runState !== RunState.running) ? "Run Tests" : "Running..." }
          </Button>
          { (runState === RunState.done) && <Button onClick={clearTestResults}>Reset</Button> }
        </div>
      </div>
      <hr />
      <TestCases testCases={ testRunArray }></TestCases>
    </>
  );
};