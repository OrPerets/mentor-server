const { MongoClient, ServerApiVersion } = require('mongodb');
const config = require('./config');

const remoteDbPassword = config.dbPassword;
const dbUserName = config.dbUserName;
const connectionString = `mongodb+srv://${dbUserName}:${remoteDbPassword}@sqlmentor.ydqmecv.mongodb.net/?retryWrites=true&w=majority&appName=SQLMentor`;

const keepEmails = [
  "roeizer@shenkar.ac.il",
  "orperets11@gmail.com",
  "michal.pauzner@shenkar.ac.il",
  "president@shenkar.ac.il"
];

const newUsers = [
  { firstName: "דוריאל", lastName: "אבויה", email: "doriel494@gmail.com", class: "summer" },
  { firstName: "קארין", lastName: "אהרונוב", email: "karinaronov17@gmail.com", class: "summer" },
  { firstName: "רועי", lastName: "אהרונסון", email: "Roeearonson30@gmail.com", class: "summer" },
  { firstName: "יהב", lastName: "אזולאי", email: "yahavaz95@gmail.com", class: "summer" },
  { firstName: "יובל", lastName: "אזולאי", email: "yuval.az19@gmail.com", class: "summer" },
  { firstName: "מוניה", lastName: "איוב", email: "monya.ayoub12@gmail.com", class: "summer" },
  { firstName: "עדי", lastName: "איזנברג", email: "adiaizen14@gmail.com", class: "summer" },
  { firstName: "עומרי", lastName: "אמיר", email: "somriamir@gmail.com", class: "summer" },
  { firstName: "שני", lastName: "אפק", email: "shaniafek@gmail.com", class: "summer" },
  { firstName: "אלינה", lastName: "ארז", email: "alinaa2398@gmail.com", class: "summer" },
  { firstName: "יובל", lastName: "ארניאס", email: "yaranias@gmail.com", class: "summer" },
  { firstName: "אור", lastName: "בר", email: "Orbar4553@gmail.com", class: "summer" },
  { firstName: "בלאל", lastName: "בשארה", email: "bilalbishara@hotmail.com", class: "summer" },
  { firstName: "בשארה", lastName: "בשארה", email: "Bishara7890@gmail.com", class: "summer" },
  { firstName: "עומר", lastName: "גוברין", email: "omer.govrin@stu.shenkar.ac.il", class: "summer" },
  { firstName: "אלינור", lastName: "דאנינו", email: "elinor4484@gmail.com", class: "summer" },
  { firstName: "אופיר", lastName: "דדון", email: "Ofirdadon2010@gmail.com", class: "summer" },
  { firstName: "עומרי", lastName: "דהן", email: "omry5596@gmail.com", class: "summer" },
  { firstName: "שירן", lastName: "דנינו", email: "Shirandanino15@gmail.com", class: "summer" },
  { firstName: "אציל", lastName: "ותד", email: "aseelseal78@gmail.com", class: "summer" },
  { firstName: "רועי", lastName: "חג'ג'", email: "roeiha2016@gmail.com", class: "summer" },
  { firstName: "ירין", lastName: "טל", email: "Yarintal80@gmail.com", class: "summer" },
  { firstName: "גיא", lastName: "יחזקאל", email: "guyechezkel@gmail.com", class: "summer" },
  { firstName: "הדר", lastName: "יחזקאל", email: "hadaryehezkel1@gmail.com", class: "summer" },
  { firstName: "רינת", lastName: "ירופייב", email: "rinat.erofeev@gmail.com", class: "summer" },
  { firstName: "רון", lastName: "כהן", email: "ronc1312@gmail.com", class: "summer" },
  { firstName: "יבגניה", lastName: "לויט", email: "levijeka@gmail.com", class: "summer" },
  { firstName: "בר", lastName: "מלכה", email: "barmalca100@gmail.com", class: "summer" },
  { firstName: "אריאל", lastName: "נחמיאס", email: "ariel2001nachmias@gmail.com", class: "summer" },
  { firstName: "פלדמן", lastName: "עבו", email: "gayaabufeldman@gmail.com", class: "summer" },
  { firstName: "עדן", lastName: "עוצמי", email: "Edenotzmi458@gmail.com", class: "summer" },
  { firstName: "שחר", lastName: "פחימה", email: "Shaharpahima21@gmail.com", class: "summer" },
  { firstName: "שי", lastName: "פיטרס", email: "petersshy7@gmail.com", class: "summer" },
  { firstName: "שנית", lastName: "קורצר", email: "shanitkur43@gmail.com", class: "summer" },
  { firstName: "בר", lastName: "ריסמני", email: "bar7424@gmail.com", class: "summer" },
  { firstName: "שחר", lastName: "רצין", email: "ratzin3@gmail.com", class: "summer" },
  { firstName: "טל", lastName: "שובל", email: "Tal28310@gmail.com", class: "summer" },
  { firstName: "עירון", lastName: "שינפלד", email: "Eronsh@gmail.com", class: "summer" },
  { firstName: "גיא", lastName: "תורן", email: "Guytoren8@gmail.com", class: "summer" },
];

newUsers.forEach(u => {
  u.isFirst = true;
  u.password = "shenkar";
});
async function patchPasswords() {
  const client = new MongoClient(connectionString, {
    serverApi: ServerApiVersion.v1
  });

  try {
    await client.connect();
    const db = client.db("experiment");
    const users = db.collection("users");

    const result = await users.updateMany(
      { password: { $exists: false } }, // Only if password is missing
      { $set: { password: "shenkar" } }
    );

    console.log(`✅ Patched ${result.modifiedCount} users with password`);
  } catch (err) {
    console.error("❌ Error patching passwords:", err);
  } finally {
    await client.close();
  }
}

patchPasswords();
