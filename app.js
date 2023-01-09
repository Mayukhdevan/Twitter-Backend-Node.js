const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");
const app = express();

app.use(express.json());

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

// Middleware function to authenticate token
const authenticateToken = (req, res, next) => {
  let jwtToken;
  const authHeader = req.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    // Token not provided
    res.status(401);
    res.send("Invalid Access Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        // Incorrect token
        res.status(401);
        res.send("Invalid Access Token");
      } else {
        req.username = payload.username; // Pass data to the next handler with req obj
        next(); // Call the next handler or middleware
      }
    });
  }
};

//User Register API
app.post("/register/", async (req, res) => {
  const { username, password, name, gender } = req.body;
  const hashedPassword = await bcrypt.hash(req.body.password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    // User doesn't exits
    if (password.length < 6) {
      // If pw length less than 6 char
      res.status(400);
      res.send("Password is too short");
    } else {
      // If Everything goes well
      const createUserQuery = `
          INSERT INTO 
            user (username, password, name, gender) 
          VALUES 
            (
              '${username}', 
              '${password}',
              '${name}', 
              '${gender}'
            )`;
      await db.run(createUserQuery);
      res.send(`User created successfully`);
    }
  } else {
    //If user already exists
    res.status(400);
    res.send("User already exists");
  }
});

//User Login API
app.post("/login/", async (req, res) => {
  const { username, password } = req.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery); // Check user in db
  if (dbUser === undefined) {
    // If user doesn't have a twitter A/C
    res.status(400);
    res.send("Invalid User");
  } else {
    // If user has an A/C
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      // Correct pw
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      res.send({ jwtToken });
    } else {
      // Incorrect pw
      res.status(400);
      res.send("Invalid Password");
    }
  }
});

// Get tweets API: Returns 4 tweets at a time
app.get("/user/tweets/feed/", authenticateToken, async (req, res) => {
  const username = req.username;

  const getTweetsQuery = `
							SELECT
								ALL_TABLE.username AS username,
								ALL_TABLE.tweet AS tweet,
								ALL_TABLE.date_time AS dateTime
							FROM
								((follower INNER JOIN
								user ON follower.following_user_id = user.user_id) AS UF
								INNER JOIN tweet ON UF.user_id = tweet.user_id) AS ALL_TABLE
							WHERE
								ALL_TABLE.follower_user_id = 
									(SELECT
										user_id
									FROM
										user
									WHERE
										username = "${username}")
							LIMIT
							  4;`;
  const tweetsArray = await db.all(getTweetsQuery);
  res.send(tweetsArray);
});

// Get following_list API
app.get("/user/following/", authenticateToken, async (req, res) => {
  const username = req.username;

  const getFollowingUsernamesQuery = `
							SELECT
								UF.name AS name
							FROM
								(follower INNER JOIN
								user ON follower.following_user_id = user.user_id) AS UF
							WHERE
								UF.follower_user_id = 
								(SELECT
									user_id
								FROM
									user
								WHERE
									username = "${username}");`;
  const namesArray = await db.all(getFollowingUsernamesQuery);
  res.send(namesArray);
});

// Get followers_list API
app.get("/user/followers/", authenticateToken, async (req, res) => {
  const username = req.username;

  const getFollowersUsernamesQuery = `
							SELECT
								UF.name AS name
							FROM
								(follower INNER JOIN
								user ON follower.follower_user_id = user.user_id) AS UF
							WHERE
								UF.follower_user_id = 
								(SELECT
									user_id
								FROM
									user
								WHERE
									username = "${username}");`;
  const namesArray = await db.all(getFollowersUsernamesQuery);
  res.send(namesArray);
});

// Get tweet API: Returns tweet as per tweetId
app.get("/tweets/:tweetId/", authenticateToken, async (req, res) => {
  const username = req.username;
  const { tweetId } = req.params;

  const getTweetQuery = `
							SELECT
								UF.tweet AS tweet,
								(SELECT COUNT() FROM like WHERE tweet_id = "${tweetId}") AS likes,
								(SELECT COUNT() FROM reply WHERE tweet_id = "${tweetId}") AS reply,
								tweet.date_time AS dateTime
							FROM
								(follower INNER JOIN
								tweet ON follower.following_user_id = tweet.user_id) AS UF
							WHERE
								UF.follower_user_id = 
								(SELECT
									user_id
								FROM
									user
								WHERE
									username = "${username}")
								AND
								UF.tweet_id = "${tweetId}";`;
  const tweetDetails = await db.get(getTweetQuery);

  if (tweetDetails === undefined) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    res.send(tweetDetails);
  }
});
