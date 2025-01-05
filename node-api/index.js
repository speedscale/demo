/****************************************************************************
 * Node.js version of the Go “distance between IPs” API,
 * updated to use AWS SDK for JavaScript (v3).
 ****************************************************************************/
import express from 'express';
import axios from 'axios';
import bodyParser from 'body-parser';

// AWS SDK v3
import {
  DynamoDBClient,
  DescribeTableCommand,
  CreateTableCommand,
  waitForTableExists,
} from '@aws-sdk/client-dynamodb';

import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';

/***************************************************************************
 * 1. Parse command line arguments
 ***************************************************************************/
if (process.argv.length < 3) {
  console.log('Usage: node app.js <ipstack_api_key> [--cache]');
  process.exit(1);
}

const ipstackAPIKey = process.argv[2];
let cacheEnabled = false;

// If the third argument is --cache, enable caching
if (process.argv[3] === '--cache') {
  cacheEnabled = true;
}

/***************************************************************************
 * 2. Configure AWS
 *    Make sure you have valid AWS credentials set in your environment,
 *    e.g. via AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION.
 ***************************************************************************/
const REGION = 'us-west-2'; // or your desired region
const TABLE_NAME = 'IPInfoResponses';

// 2a. Create low-level client
const dynamoClient = new DynamoDBClient({ region: REGION });

// 2b. Create DocumentClient wrapper
//     Provides a higher-level abstraction that automatically converts
//     native JavaScript data types to/from DynamoDB format.
const docClient = DynamoDBDocumentClient.from(dynamoClient);

/***************************************************************************
 * 3. Ensure the DynamoDB table exists (if caching)
 ***************************************************************************/
async function ensureTableExists() {
  try {
    // Check if table exists
    await dynamoClient.send(
      new DescribeTableCommand({ TableName: TABLE_NAME })
    );
    console.log(`Table "${TABLE_NAME}" already exists`);
  } catch (err) {
    if (err.name === 'ResourceNotFoundException') {
      console.log(`Table "${TABLE_NAME}" not found. Creating...`);
      // Create the table
      await dynamoClient.send(
        new CreateTableCommand({
          TableName: TABLE_NAME,
          AttributeDefinitions: [
            {
              AttributeName: 'ID',
              AttributeType: 'S',
            },
          ],
          KeySchema: [
            {
              AttributeName: 'ID',
              KeyType: 'HASH',
            },
          ],
          ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5,
          },
        })
      );

      // Wait for the table to exist
      await waitForTableExists(
        { client: dynamoClient, maxWaitTime: 60 },
        { TableName: TABLE_NAME }
      );
      console.log(`Table "${TABLE_NAME}" created successfully`);
    } else {
      console.error('Error describing/creating table:', err);
      throw err;
    }
  }
}

// If cache is enabled, ensure the table exists
if (cacheEnabled) {
  ensureTableExists().catch((err) => {
    console.error('Failed to ensure DynamoDB table exists:', err);
    process.exit(1);
  });
}

/***************************************************************************
 * 4. Create the Express application
 ***************************************************************************/
const app = express();
app.use(bodyParser.json());

// GET /get-ip-info?ip1=...&ip2=...
app.get('/get-ip-info', async (req, res) => {
  try {
    const ip1 = req.query.ip1;
    const ip2 = req.query.ip2;

    if (!ip1) {
      return res.status(400).json({ error: 'IP address "ip1" is required' });
    }
    if (!ip2) {
      return res.status(400).json({ error: 'Second IP address "ip2" is required' });
    }

    // If caching is enabled, try reading from DynamoDB first
    if (cacheEnabled) {
      try {
        const responseFromDDB = await getResponseFromDynamoDB(ip1, ip2);
        if (responseFromDDB) {
          console.log('Cache hit:', responseFromDDB);
          return res.json(responseFromDDB);
        }
        // If no record found, proceed to fetch from ipstack
      } catch (err) {
        console.error('Failed to get item from DynamoDB:', err);
        // Fallback to IP API if there's an error
      }
    }

    // 1) Get IP info from ipstack
    const result1 = await getIPInfo(ip1);
    const result2 = await getIPInfo(ip2);

    // 2) Calculate distance with the haversine formula
    const distanceKm = haversineDistance(
      result1.latitude,
      result1.longitude,
      result2.latitude,
      result2.longitude
    );

    // 3) Build up the response object
    const responseToReturn = {
      distance: distanceKm,
      request1: result1,
      request2: result2,
    };

    // 4) Send back JSON to the client
    res.json(responseToReturn);

    // 5) If caching is enabled, store in DynamoDB
    if (cacheEnabled) {
      try {
        await storeResponseInDynamoDB(responseToReturn);
      } catch (err) {
        console.error('Failed to store response in DynamoDB:', err);
      }
    }
    console.log('Response sent:', responseToReturn);
  } catch (err) {
    console.error('Error in /get-ip-info handler:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/***************************************************************************
 * 5. Helper: Fetch IP info from ipstack
 ***************************************************************************/
async function getIPInfo(ip) {
  const ipstackURL = `http://api.ipstack.com/${ip}?access_key=${ipstackAPIKey}`;
  const resp = await axios.get(ipstackURL);
  return resp.data;
}

/***************************************************************************
 * 6. Helper: DynamoDB read
 ***************************************************************************/
async function getResponseFromDynamoDB(ip1, ip2) {
  const key = `${ip1}|${ip2}`;

  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { ID: key },
    })
  );

  // If no item, return null
  if (!result.Item) {
    return null;
  }
  return result.Item;
}

/***************************************************************************
 * 7. Helper: DynamoDB write
 ***************************************************************************/
async function storeResponseInDynamoDB(response) {
  // Construct a key: ip1|ip2
  const ip1 = response.request1.ip;
  const ip2 = response.request2.ip;
  const key = `${ip1}|${ip2}`;

  // Add the key to the object
  const itemToStore = {
    ...response,
    ID: key,
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: itemToStore,
    })
  );
}

/***************************************************************************
 * 8. Haversine distance (in kilometers)
 ***************************************************************************/
function haversineDistance(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371.0; // in km

  function toRadians(deg) {
    return (deg * Math.PI) / 180.0;
  }

  const lat1Rad = toRadians(lat1);
  const lon1Rad = toRadians(lon1);
  const lat2Rad = toRadians(lat2);
  const lon2Rad = toRadians(lon2);

  const dLat = lat2Rad - lat1Rad;
  const dLon = lon2Rad - lon1Rad;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

/***************************************************************************
 * 9. Start the server
 ***************************************************************************/
const PORT = 8080;
app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});