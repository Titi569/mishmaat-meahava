/**
 * משמעת מאהבה – גיבוי יומי ל-Gmail
 *
 * מה הסקריפט עושה:
 * 1. מקבל מהאפליקציה את הנתונים העדכניים בכל פעם שמשהו משתנה (doPost),
 *    ושומר אותם בקובץ אחד ב-Google Drive שלך.
 * 2. בכל יום בסביבות 17:00 שולח לך מייל עם הנתונים כקובץ מצורף,
 *    מסמן אותו בתווית "גיבוי משמעת מאהבה" ומוציא אותו מתיבת הדואר הנכנס.
 * 3. משאיר רק את 4 הגיבויים האחרונים בתווית. גיבויים ישנים יותר עוברים לאשפה.
 *
 * התקנה: להריץ פעם אחת את הפונקציה setup, ואחר כך לפרוס (Deploy) כ-Web app.
 */

const LABEL_NAME = 'גיבוי משמעת מאהבה';
const KEEP = 4;
const FILE_NAME = 'mishmaat-latest.json';
const HOUR = 17;

function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('TOKEN')) {
    props.setProperty('TOKEN', Utilities.getUuid().replace(/-/g, ''));
  }
  GmailApp.getUserLabelByName(LABEL_NAME) || GmailApp.createLabel(LABEL_NAME);
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'dailyBackup')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('dailyBackup').timeBased().everyDays(1).atHour(HOUR).nearMinute(0)
    .inTimezone('Asia/Jerusalem').create();
  latestFile_();
  Logger.log('TOKEN: ' + props.getProperty('TOKEN'));
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.token !== PropertiesService.getScriptProperties().getProperty('TOKEN')) {
      return json_({ ok: false, error: 'token' });
    }
    if (!body.data || typeof body.data !== 'object' || !Object.keys(body.data).length) {
      return json_({ ok: false, error: 'empty' });
    }
    latestFile_().setContent(JSON.stringify({ app: 'mishmaat', v: 1, at: new Date().toISOString(), data: body.data }));
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doGet() {
  return json_({ ok: true, app: 'mishmaat-backup' });
}

function dailyBackup() {
  const file = latestFile_();
  const content = file.getBlob().getDataAsString();
  if (!content || content === '{}') return;

  const tz = 'Asia/Jerusalem';
  const day = Utilities.formatDate(new Date(), tz, 'dd.MM.yyyy');
  const stamp = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const subject = LABEL_NAME + ' – ' + day;
  const me = Session.getEffectiveUser().getEmail();
  const blob = Utilities.newBlob(content, 'application/json', 'mishmaat-gibui-' + stamp + '.json');

  GmailApp.sendEmail(me, subject,
    'גיבוי אוטומטי של האפליקציה "משמעת מאהבה".\n' +
    'לשחזור: באפליקציה, בכרטיס "גיבוי", לוחצים "שחזור מקובץ" ובוחרים את הקובץ המצורף.',
    { attachments: [blob], name: 'משמעת מאהבה' });

  Utilities.sleep(4000);
  const label = GmailApp.getUserLabelByName(LABEL_NAME) || GmailApp.createLabel(LABEL_NAME);
  const found = GmailApp.search('subject:"' + subject + '" from:me newer_than:1d', 0, 5);
  found.forEach(t => { t.addLabel(label); t.moveToArchive(); });

  const threads = label.getThreads(0, 100)
    .sort((a, b) => b.getLastMessageDate() - a.getLastMessageDate());
  threads.slice(KEEP).forEach(t => t.moveToTrash());
}

function latestFile_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FILE_ID');
  if (id) {
    try { return DriveApp.getFileById(id); } catch (e) { /* recreate below */ }
  }
  const f = DriveApp.createFile(FILE_NAME, '{}', 'application/json');
  props.setProperty('FILE_ID', f.getId());
  return f;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
