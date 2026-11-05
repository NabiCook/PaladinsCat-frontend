/******/ (() => { // webpackBootstrap
/******/ 	"use strict";

;// ./lib/image-asset-fallbacks.json
const image_asset_fallbacks_namespaceObject = /*#__PURE__*/JSON.parse('{"/images/champion-history/androxus/cursed-revolver":"webp","/images/champion-history/androxus/heads-will-roll":"webp","/images/champion-history/ash/rally-here":"webp","/images/champion-history/barik/architectonics":"webp","/images/champion-history/barik/hair-trigger":"webp","/images/champion-history/bombking/demolition":"webp","/images/champion-history/buck/bucking-madness":"webp","/images/champion-history/cassie/just-breathe":"webp","/images/champion-history/dredge/general":"webp","/images/champion-history/fernando/dragonfire-lance":"webp","/images/champion-history/grohk/spirits-domain":"webp","/images/champion-history/grohk/wraith":"webp","/images/champion-history/grover/efflorescence":"webp","/images/champion-history/grover/rampant-blooming":"webp","/images/champion-history/inara/mothers-grace":"webp","/images/champion-history/inara/wrath-of-the-stagalla":"webp","/images/champion-history/io/goddess-blessing":"webp","/images/champion-history/jenos/celestial-touch":"webp","/images/champion-history/kasumi/spirit-bombs-haunted-ground":"webp","/images/champion-history/khan/lians-shield":"webp","/images/champion-history/kinessa/octoppressor":"webp","/images/champion-history/kinessa/oppression":"webp","/images/champion-history/kinessa/suppression":"webp","/images/champion-history/koga/adrenaline-junkie":"webp","/images/champion-history/koga/master-of-arms":"webp","/images/champion-history/lex/fought-the-law":"webp","/images/champion-history/lex/the-law-won":"webp","/images/champion-history/lian/death-and-taxes":"webp","/images/champion-history/maeve/rogues-gambit":"webp","/images/champion-history/maeve/street-justice":"webp","/images/champion-history/makoa/davey-jones-locker":"webp","/images/champion-history/maldamba/wekono-s-curse":"webp","/images/champion-history/maldamba/wekonos-curse":"webp","/images/champion-history/moji/boom-boom":"webp","/images/champion-history/moji/snack-attack":"webp","/images/champion-history/moji/toot":"webp","/images/champion-history/octavia/asymmetrical-warfare":"webp","/images/champion-history/pip/acrobatics":"webp","/images/champion-history/pip/mischief":"webp","/images/champion-history/rei/extension":"webp","/images/champion-history/ruckus/recycler":"webp","/images/champion-history/saati/heads-or-tails":"webp","/images/champion-history/seris/agony":"webp","/images/champion-history/seris/forsake-replaces-mortal-reach":"webp","/images/champion-history/seris/mortal-reach":"webp","/images/champion-history/seris/soul-collector":"webp","/images/champion-history/seris/the-void-abides":"webp","/images/champion-history/shalin/desert-silence":"webp","/images/champion-history/shalin/explosive-arrows":"webp","/images/champion-history/skye/smoke-and-daggers":"webp","/images/champion-history/skye/surprise-attack":"webp","/images/champion-history/talus/raging-demon":"webp","/images/champion-history/terminus/seething-rage":"webp","/images/champion-history/torvald/alternating-current":"webp","/images/champion-history/tyra/first-blood":"webp","/images/champion-history/vii/overcharged":"webp","/images/champion-history/viktor/firefight":"webp","/images/champion-history/viktor/gunnery":"webp","/images/champion-history/vora/deafening-silence":"webp","/images/champion-history/vora/relentless-presence":"webp","/images/champion-history/willo/scorched-earth":"webp","/images/champion-history/ying/lifelike":"webp","/images/projects/wolper-replay-icon":"webp","/images/projects/wolper-scoreboard-icon":"webp","/images/skins/androxus/12199":"webp","/images/skins/androxus/13309":"webp","/images/skins/androxus/15143":"webp","/images/skins/androxus/15144":"webp","/images/skins/androxus/15145":"webp","/images/skins/androxus/15146":"webp","/images/skins/androxus/16405":"webp","/images/skins/androxus/17156":"webp","/images/skins/androxus/19124":"webp","/images/skins/androxus/19125":"webp","/images/skins/androxus/20189":"webp","/images/skins/androxus/22836":"webp","/images/skins/androxus/23039":"webp","/images/skins/androxus/23040":"webp","/images/skins/androxus/23041":"webp","/images/skins/androxus/23093":"webp","/images/skins/androxus/23950":"webp","/images/skins/androxus/24526":"webp","/images/skins/androxus/24533":"webp","/images/skins/androxus/24583":"webp","/images/skins/androxus/26913":"webp","/images/skins/androxus/27012":"webp","/images/skins/androxus/31013":"webp","/images/skins/androxus/31784":"webp","/images/skins/androxus/32733":"webp","/images/skins/ash/10008":"webp","/images/skins/ash/16977":"webp","/images/skins/ash/18863":"webp","/images/skins/ash/18864":"webp","/images/skins/ash/18865":"webp","/images/skins/ash/19257":"webp","/images/skins/ash/22866":"webp","/images/skins/ash/23042":"webp","/images/skins/ash/23073":"webp","/images/skins/ash/24294":"webp","/images/skins/ash/24918":"webp","/images/skins/ash/25016":"webp","/images/skins/ash/31570":"webp","/images/skins/ash/33767":"webp","/images/skins/atlas/10006":"webp","/images/skins/atlas/24035":"webp","/images/skins/atlas/24340":"webp","/images/skins/atlas/24369":"webp","/images/skins/atlas/24406":"webp","/images/skins/atlas/24502":"webp","/images/skins/atlas/30822":"webp","/images/skins/atlas/30823":"webp","/images/skins/azaan/10009":"webp","/images/skins/azaan/27743":"webp","/images/skins/azaan/27777":"webp","/images/skins/azaan/27778":"webp","/images/skins/azaan/27781":"webp","/images/skins/azaan/27943":"webp","/images/skins/barik/12200":"webp","/images/skins/barik/13314":"webp","/images/skins/barik/14870":"webp","/images/skins/barik/15225":"webp","/images/skins/barik/15226":"webp","/images/skins/barik/17197":"webp","/images/skins/barik/19683":"webp","/images/skins/barik/19686":"webp","/images/skins/barik/19768":"webp","/images/skins/barik/19772":"webp","/images/skins/barik/24542":"webp","/images/skins/barik/24641":"webp","/images/skins/barik/25292":"webp","/images/skins/bettylabomba/29424":"webp","/images/skins/bettylabomba/30637":"webp","/images/skins/bettylabomba/30639":"webp","/images/skins/bettylabomba/30669":"webp","/images/skins/bettylabomba/30834":"webp","/images/skins/bombking/13336":"webp","/images/skins/bombking/14359":"webp","/images/skins/bombking/14943":"webp","/images/skins/bombking/14945":"webp","/images/skins/bombking/14998":"webp","/images/skins/bombking/15568":"webp","/images/skins/bombking/17079":"webp","/images/skins/bombking/19422":"webp","/images/skins/bombking/19424":"webp","/images/skins/bombking/20145":"webp","/images/skins/bombking/21268":"webp","/images/skins/bombking/24280":"webp","/images/skins/bombking/24512":"webp","/images/skins/bombking/26655":"webp","/images/skins/bombking/26665":"webp","/images/skins/bombking/30623":"webp","/images/skins/bombking/30624":"webp","/images/skins/bombking/32595":"webp","/images/skins/bombking/33106":"webp","/images/skins/buck/12205":"webp","/images/skins/buck/13273":"webp","/images/skins/buck/13274":"webp","/images/skins/buck/14314":"webp","/images/skins/buck/15600":"webp","/images/skins/buck/15601":"webp","/images/skins/buck/15602":"webp","/images/skins/buck/15608":"webp","/images/skins/buck/15634":"webp","/images/skins/buck/17144":"webp","/images/skins/buck/19126":"webp","/images/skins/buck/19127":"webp","/images/skins/buck/23677":"webp","/images/skins/buck/26383":"webp","/images/skins/buck/27166":"webp","/images/skins/buck/27185":"webp","/images/skins/caspian/30992":"webp","/images/skins/caspian/30993":"webp","/images/skins/caspian/30994":"webp","/images/skins/caspian/30995":"webp","/images/skins/caspian/31104":"webp","/images/skins/caspian/31157":"webp","/images/skins/caspian/32375":"webp","/images/skins/cassie/12201":"webp","/images/skins/cassie/12786":"webp","/images/skins/cassie/13267":"webp","/images/skins/cassie/13301":"webp","/images/skins/cassie/15949":"webp","/images/skins/cassie/15950":"webp","/images/skins/cassie/15951":"webp","/images/skins/cassie/15952":"webp","/images/skins/cassie/18615":"webp","/images/skins/cassie/18846":"webp","/images/skins/cassie/19397":"webp","/images/skins/cassie/19544":"webp","/images/skins/cassie/19545":"webp","/images/skins/cassie/20070":"webp","/images/skins/cassie/23395":"webp","/images/skins/cassie/25473":"webp","/images/skins/cassie/29972":"webp","/images/skins/corvus/25368":"webp","/images/skins/corvus/25479":"webp","/images/skins/corvus/25490":"webp","/images/skins/corvus/25492":"webp","/images/skins/corvus/25493":"webp","/images/skins/corvus/27440":"webp","/images/skins/corvus/27580":"webp","/images/skins/corvus/30959":"webp","/images/skins/corvus/32333":"webp","/images/skins/corvus/32340":"webp","/images/skins/dredge/23363":"webp","/images/skins/dredge/23596":"webp","/images/skins/dredge/23813":"webp","/images/skins/dredge/23935":"webp","/images/skins/dredge/24001":"webp","/images/skins/dredge/27506":"webp","/images/skins/drogoz/13404":"webp","/images/skins/drogoz/14132":"webp","/images/skins/drogoz/15268":"webp","/images/skins/drogoz/15269":"webp","/images/skins/drogoz/15270":"webp","/images/skins/drogoz/16558":"webp","/images/skins/drogoz/18679":"webp","/images/skins/drogoz/18680":"webp","/images/skins/drogoz/19335":"webp","/images/skins/drogoz/19787":"webp","/images/skins/drogoz/19971":"webp","/images/skins/drogoz/23191":"webp","/images/skins/drogoz/24468":"webp","/images/skins/drogoz/26300":"webp","/images/skins/drogoz/26393":"webp","/images/skins/drogoz/33742":"webp","/images/skins/evie/12202":"webp","/images/skins/evie/13266":"webp","/images/skins/evie/13297":"webp","/images/skins/evie/14847":"webp","/images/skins/evie/15211":"webp","/images/skins/evie/15216":"webp","/images/skins/evie/15863":"webp","/images/skins/evie/17162":"webp","/images/skins/evie/19054":"webp","/images/skins/evie/19055":"webp","/images/skins/evie/19743":"webp","/images/skins/evie/25145":"webp","/images/skins/evie/27341":"webp","/images/skins/evie/32358":"webp","/images/skins/fernando/12203":"webp","/images/skins/fernando/12784":"webp","/images/skins/fernando/12785":"webp","/images/skins/fernando/14805":"webp","/images/skins/fernando/14806":"webp","/images/skins/fernando/15922":"webp","/images/skins/fernando/16685":"webp","/images/skins/fernando/19420":"webp","/images/skins/fernando/19421":"webp","/images/skins/fernando/19538":"webp","/images/skins/fernando/19879":"webp","/images/skins/fernando/23043":"webp","/images/skins/fernando/23044":"webp","/images/skins/fernando/23590":"webp","/images/skins/fernando/23734":"webp","/images/skins/fernando/24265":"webp","/images/skins/fernando/24581":"webp","/images/skins/fernando/24715":"webp","/images/skins/fernando/32374":"webp","/images/skins/fernando/32997":"webp","/images/skins/fernando/33740":"webp","/images/skins/furia/23074":"webp","/images/skins/furia/23301":"webp","/images/skins/furia/23418":"webp","/images/skins/furia/23521":"webp","/images/skins/furia/23884":"webp","/images/skins/furia/23940":"webp","/images/skins/furia/25028":"webp","/images/skins/furia/25413":"webp","/images/skins/furia/25418":"webp","/images/skins/furia/30923":"webp","/images/skins/furia/32841":"webp","/images/skins/furia/33200":"webp","/images/skins/furia/33445":"webp","/images/skins/grohk/12204":"webp","/images/skins/grohk/13264":"webp","/images/skins/grohk/13298":"webp","/images/skins/grohk/14129":"webp","/images/skins/grohk/15252":"webp","/images/skins/grohk/15253":"webp","/images/skins/grohk/20240":"webp","/images/skins/grohk/20241":"webp","/images/skins/grohk/22526":"webp","/images/skins/grohk/23079":"webp","/images/skins/grohk/24022":"webp","/images/skins/grohk/25541":"webp","/images/skins/grohk/33703":"webp","/images/skins/grover/12940":"webp","/images/skins/grover/13275":"webp","/images/skins/grover/14144":"webp","/images/skins/grover/15598":"webp","/images/skins/grover/17082":"webp","/images/skins/grover/19727":"webp","/images/skins/grover/23045":"webp","/images/skins/grover/23046":"webp","/images/skins/grover/23558":"webp","/images/skins/grover/23948":"webp","/images/skins/grover/24915":"webp","/images/skins/grover/25013":"webp","/images/skins/grover/33056":"webp","/images/skins/grover/33058":"webp","/images/skins/imani/23855":"webp","/images/skins/imani/24123":"webp","/images/skins/imani/24124":"webp","/images/skins/imani/24126":"webp","/images/skins/imani/24269":"webp","/images/skins/imani/24552":"webp","/images/skins/imani/24643":"webp","/images/skins/imani/26327":"webp","/images/skins/imani/26475":"webp","/images/skins/imani/26485":"webp","/images/skins/imani/26487":"webp","/images/skins/imani/26495":"webp","/images/skins/imani/26497":"webp","/images/skins/imani/26499":"webp","/images/skins/imani/26501":"webp","/images/skins/imani/26915":"webp","/images/skins/imani/27014":"webp","/images/skins/imani/30916":"webp","/images/skins/inara/16245":"webp","/images/skins/inara/16709":"webp","/images/skins/inara/16710":"webp","/images/skins/inara/16711":"webp","/images/skins/inara/18870":"webp","/images/skins/inara/19344":"webp","/images/skins/inara/19546":"webp","/images/skins/inara/19547":"webp","/images/skins/inara/23672":"webp","/images/skins/inara/24264":"webp","/images/skins/inara/24528":"webp","/images/skins/inara/26313":"webp","/images/skins/inara/26413":"webp","/images/skins/inara/26437":"webp","/images/skins/inara/26439":"webp","/images/skins/inara/26441":"webp","/images/skins/inara/26443":"webp","/images/skins/inara/26445":"webp","/images/skins/inara/26447":"webp","/images/skins/inara/27174":"webp","/images/skins/inara/30976":"webp","/images/skins/io/24472":"webp","/images/skins/io/24475":"webp","/images/skins/io/24476":"webp","/images/skins/io/24608":"webp","/images/skins/io/24655":"webp","/images/skins/io/24903":"webp","/images/skins/io/26319":"webp","/images/skins/io/26411":"webp","/images/skins/io/26425":"webp","/images/skins/io/26427":"webp","/images/skins/io/26429":"webp","/images/skins/io/26431":"webp","/images/skins/io/26433":"webp","/images/skins/io/26435":"webp","/images/skins/io/27744":"webp","/images/skins/io/30828":"webp","/images/skins/io/30829":"webp","/images/skins/jenos/10005":"webp","/images/skins/jenos/19034":"webp","/images/skins/jenos/19390":"webp","/images/skins/jenos/19392":"webp","/images/skins/jenos/19520":"webp","/images/skins/jenos/19866":"webp","/images/skins/jenos/21123":"webp","/images/skins/jenos/22527":"webp","/images/skins/jenos/22869":"webp","/images/skins/jenos/23047":"webp","/images/skins/jenos/23845":"webp","/images/skins/jenos/23960":"webp","/images/skins/jenos/25538":"webp","/images/skins/jenos/26746":"webp","/images/skins/jenos/26831":"webp","/images/skins/jenos/26924":"webp","/images/skins/jenos/31159":"webp","/images/skins/jenos/32716":"webp","/images/skins/kasumi/31333":"webp","/images/skins/kasumi/31418":"webp","/images/skins/kasumi/31419":"webp","/images/skins/kasumi/31420":"webp","/images/skins/kasumi/31564":"webp","/images/skins/khan/19895":"webp","/images/skins/khan/23099":"webp","/images/skins/khan/23332":"webp","/images/skins/khan/23536":"webp","/images/skins/khan/23681":"webp","/images/skins/khan/24636":"webp","/images/skins/khan/24989":"webp","/images/skins/khan/25315":"webp","/images/skins/khan/25515":"webp","/images/skins/khan/26712":"webp","/images/skins/khan/26714":"webp","/images/skins/khan/28239":"webp","/images/skins/khan/30617":"webp","/images/skins/khan/32373":"webp","/images/skins/khan/32844":"webp","/images/skins/khan/32845":"webp","/images/skins/kinessa/12941":"webp","/images/skins/kinessa/13303":"webp","/images/skins/kinessa/14274":"webp","/images/skins/kinessa/14335":"webp","/images/skins/kinessa/15231":"webp","/images/skins/kinessa/15232":"webp","/images/skins/kinessa/16693":"webp","/images/skins/kinessa/19305":"webp","/images/skins/kinessa/19717":"webp","/images/skins/kinessa/21260":"webp","/images/skins/kinessa/23048":"webp","/images/skins/kinessa/24631":"webp","/images/skins/kinessa/24676":"webp","/images/skins/kinessa/24711":"webp","/images/skins/kinessa/27295":"webp","/images/skins/kinessa/30832":"webp","/images/skins/kinessa/32718":"webp","/images/skins/koga/10002":"webp","/images/skins/koga/23448":"webp","/images/skins/koga/23476":"webp","/images/skins/koga/23477":"webp","/images/skins/koga/23593":"webp","/images/skins/koga/24108":"webp","/images/skins/koga/24571":"webp","/images/skins/koga/24717":"webp","/images/skins/koga/26721":"webp","/images/skins/koga/26841":"webp","/images/skins/koga/29975":"webp","/images/skins/koga/31782":"webp","/images/skins/lex/10003":"webp","/images/skins/lex/16531":"webp","/images/skins/lex/16949":"webp","/images/skins/lex/16950":"webp","/images/skins/lex/16951":"webp","/images/skins/lex/18643":"webp","/images/skins/lex/18644":"webp","/images/skins/lex/18843":"webp","/images/skins/lex/19338":"webp","/images/skins/lex/19354":"webp","/images/skins/lex/20082":"webp","/images/skins/lex/22528":"webp","/images/skins/lex/23185":"webp","/images/skins/lex/24634":"webp","/images/skins/lex/24979":"webp","/images/skins/lex/25049":"webp","/images/skins/lex/27297":"webp","/images/skins/lian/19032":"webp","/images/skins/lian/19314":"webp","/images/skins/lian/19315":"webp","/images/skins/lian/19316":"webp","/images/skins/lian/19486":"webp","/images/skins/lian/20208":"webp","/images/skins/lian/20419":"webp","/images/skins/lian/23865":"webp","/images/skins/lian/24569":"webp","/images/skins/lian/24668":"webp","/images/skins/lian/24713":"webp","/images/skins/lian/24913":"webp","/images/skins/lian/25014":"webp","/images/skins/lian/26745":"webp","/images/skins/lian/26857":"webp","/images/skins/lian/31148":"webp","/images/skins/lian/31149":"webp","/images/skins/lillith/30817":"webp","/images/skins/lillith/30839":"webp","/images/skins/lillith/30840":"webp","/images/skins/lillith/30857":"webp","/images/skins/lillith/30961":"webp","/images/skins/lillith/32721":"webp","/images/skins/lillith/32723":"webp","/images/skins/maeve/16216":"webp","/images/skins/maeve/16510":"webp","/images/skins/maeve/16511":"webp","/images/skins/maeve/16512":"webp","/images/skins/maeve/17074":"webp","/images/skins/maeve/18564":"webp","/images/skins/maeve/18651":"webp","/images/skins/maeve/18652":"webp","/images/skins/maeve/19275":"webp","/images/skins/maeve/20393":"webp","/images/skins/maeve/23092":"webp","/images/skins/maeve/23889":"webp","/images/skins/maeve/24301":"webp","/images/skins/maeve/24591":"webp","/images/skins/maeve/24756":"webp","/images/skins/maeve/24904":"webp","/images/skins/maeve/25202":"webp","/images/skins/maeve/25203":"webp","/images/skins/maeve/27288":"webp","/images/skins/maeve/27887":"webp","/images/skins/maeve/27916":"webp","/images/skins/maeve/32735":"webp","/images/skins/makoa/10000":"webp","/images/skins/makoa/14465":"webp","/images/skins/makoa/14914":"webp","/images/skins/makoa/14915":"webp","/images/skins/makoa/14916":"webp","/images/skins/makoa/15648":"webp","/images/skins/makoa/15649":"webp","/images/skins/makoa/16688":"webp","/images/skins/makoa/17090":"webp","/images/skins/makoa/17091":"webp","/images/skins/makoa/19680":"webp","/images/skins/makoa/20432":"webp","/images/skins/makoa/23049":"webp","/images/skins/makoa/23412":"webp","/images/skins/makoa/24004":"webp","/images/skins/makoa/25466":"webp","/images/skins/makoa/32335":"webp","/images/skins/makoa/32833":"webp","/images/skins/makoa/33705":"webp","/images/skins/makoa/33744":"webp","/images/skins/maldamba/14587":"webp","/images/skins/maldamba/15423":"webp","/images/skins/maldamba/15424":"webp","/images/skins/maldamba/15425":"webp","/images/skins/maldamba/16682":"webp","/images/skins/maldamba/19065":"webp","/images/skins/maldamba/19066":"webp","/images/skins/maldamba/19258":"webp","/images/skins/maldamba/19752":"webp","/images/skins/maldamba/22529":"webp","/images/skins/maldamba/23407":"webp","/images/skins/maldamba/23679":"webp","/images/skins/maldamba/24493":"webp","/images/skins/maldamba/24494":"webp","/images/skins/maldamba/24529":"webp","/images/skins/maldamba/26703":"webp","/images/skins/moji/20002":"webp","/images/skins/moji/21132":"webp","/images/skins/moji/21135":"webp","/images/skins/moji/23454":"webp","/images/skins/moji/23843":"webp","/images/skins/moji/30835":"webp","/images/skins/moji/30989":"webp","/images/skins/moji/33258":"webp","/images/skins/moji/33292":"webp","/images/skins/nyx/31812":"webp","/images/skins/nyx/31829":"webp","/images/skins/nyx/31831":"webp","/images/skins/nyx/31833":"webp","/images/skins/nyx/32843":"webp","/images/skins/nyx/32943":"webp","/images/skins/octavia/26984":"webp","/images/skins/octavia/27063":"webp","/images/skins/octavia/27067":"webp","/images/skins/octavia/27069":"webp","/images/skins/octavia/27172":"webp","/images/skins/octavia/27183":"webp","/images/skins/omen/32624":"webp","/images/skins/omen/32627":"webp","/images/skins/omen/32629":"webp","/images/skins/omen/32631":"webp","/images/skins/omen/33060":"webp","/images/skins/omen/33062":"webp","/images/skins/pip/12198":"webp","/images/skins/pip/13276":"webp","/images/skins/pip/13277":"webp","/images/skins/pip/14336":"webp","/images/skins/pip/14832":"webp","/images/skins/pip/14937":"webp","/images/skins/pip/14938":"webp","/images/skins/pip/17135":"webp","/images/skins/pip/18224":"webp","/images/skins/pip/19957":"webp","/images/skins/pip/19959":"webp","/images/skins/pip/20156":"webp","/images/skins/pip/23050":"webp","/images/skins/pip/23841":"webp","/images/skins/pip/27982":"webp","/images/skins/pip/31241":"webp","/images/skins/raum/24900":"webp","/images/skins/raum/24982":"webp","/images/skins/raum/24983":"webp","/images/skins/raum/25046":"webp","/images/skins/raum/25206":"webp","/images/skins/raum/25209":"webp","/images/skins/raum/26705":"webp","/images/skins/raum/26885":"webp","/images/skins/raum/27008":"webp","/images/skins/raum/31556":"webp","/images/skins/raum/31557":"webp","/images/skins/rei/27361":"webp","/images/skins/rei/27368":"webp","/images/skins/rei/27369":"webp","/images/skins/rei/27370":"webp","/images/skins/rei/27497":"webp","/images/skins/rei/27942":"webp","/images/skins/rei/27981":"webp","/images/skins/rei/32597":"webp","/images/skins/rei/32942":"webp","/images/skins/rei/33741":"webp","/images/skins/ruckus/12206":"webp","/images/skins/ruckus/13271":"webp","/images/skins/ruckus/13272":"webp","/images/skins/ruckus/13300":"webp","/images/skins/ruckus/15812":"webp","/images/skins/ruckus/15813":"webp","/images/skins/ruckus/18848":"webp","/images/skins/ruckus/22059":"webp","/images/skins/ruckus/23052":"webp","/images/skins/ruckus/24593":"webp","/images/skins/ruckus/24764":"webp","/images/skins/ruckus/24905":"webp","/images/skins/saati/27516":"webp","/images/skins/saati/27539":"webp","/images/skins/saati/27540":"webp","/images/skins/saati/27599":"webp","/images/skins/saati/27736":"webp","/images/skins/saati/27755":"webp","/images/skins/saati/30913":"webp","/images/skins/saati/31772":"webp","/images/skins/saati/31786":"webp","/images/skins/seris/16584":"webp","/images/skins/seris/17190":"webp","/images/skins/seris/17191":"webp","/images/skins/seris/17193":"webp","/images/skins/seris/19276":"webp","/images/skins/seris/19698":"webp","/images/skins/seris/19701":"webp","/images/skins/seris/19891":"webp","/images/skins/seris/20184":"webp","/images/skins/seris/20428":"webp","/images/skins/seris/22897":"webp","/images/skins/seris/23053":"webp","/images/skins/seris/23854":"webp","/images/skins/seris/24282":"webp","/images/skins/seris/26321":"webp","/images/skins/seris/26394":"webp","/images/skins/seris/26397":"webp","/images/skins/seris/26399":"webp","/images/skins/seris/26401":"webp","/images/skins/seris/26403":"webp","/images/skins/seris/26405":"webp","/images/skins/seris/26407":"webp","/images/skins/seris/27511":"webp","/images/skins/seris/30958":"webp","/images/skins/seris/31767":"webp","/images/skins/seris/31770":"webp","/images/skins/seris/32648":"webp","/images/skins/seris/32737":"webp","/images/skins/seris/33690":"webp","/images/skins/shalin/14890":"webp","/images/skins/shalin/15750":"webp","/images/skins/shalin/15751":"webp","/images/skins/shalin/15762":"webp","/images/skins/shalin/16691":"webp","/images/skins/shalin/17150":"webp","/images/skins/shalin/17151":"webp","/images/skins/shalin/17152":"webp","/images/skins/shalin/22530":"webp","/images/skins/shalin/23450":"webp","/images/skins/shalin/23965":"webp","/images/skins/shalin/26392":"webp","/images/skins/skye/12207":"webp","/images/skins/skye/12787":"webp","/images/skins/skye/13263":"webp","/images/skins/skye/13302":"webp","/images/skins/skye/15413":"webp","/images/skins/skye/15414":"webp","/images/skins/skye/16344":"webp","/images/skins/skye/19290":"webp","/images/skins/skye/19418":"webp","/images/skins/skye/19419":"webp","/images/skins/skye/19783":"webp","/images/skins/skye/22173":"webp","/images/skins/skye/23489":"webp","/images/skins/skye/23911":"webp","/images/skins/skye/23912":"webp","/images/skins/skye/24298":"webp","/images/skins/skye/27443":"webp","/images/skins/skye/27578":"webp","/images/skins/skye/29970":"webp","/images/skins/skye/30622":"webp","/images/skins/skye/32645":"webp","/images/skins/strix/19112":"webp","/images/skins/strix/19667":"webp","/images/skins/strix/19668":"webp","/images/skins/strix/19734":"webp","/images/skins/strix/20061":"webp","/images/skins/strix/20200":"webp","/images/skins/strix/21155":"webp","/images/skins/strix/22531":"webp","/images/skins/strix/23330":"webp","/images/skins/strix/23693":"webp","/images/skins/strix/23927":"webp","/images/skins/strix/24645":"webp","/images/skins/strix/24763":"webp","/images/skins/strix/24990":"webp","/images/skins/strix/25500":"webp","/images/skins/strix/25512":"webp","/images/skins/strix/33065":"webp","/images/skins/talus/19324":"webp","/images/skins/talus/19794":"webp","/images/skins/talus/19795":"webp","/images/skins/talus/19864":"webp","/images/skins/talus/23643":"webp","/images/skins/talus/24919":"webp","/images/skins/talus/25015":"webp","/images/skins/talus/27218":"webp","/images/skins/terminus/19431":"webp","/images/skins/terminus/19955":"webp","/images/skins/terminus/19956":"webp","/images/skins/terminus/20174":"webp","/images/skins/terminus/23892":"webp","/images/skins/terminus/23942":"webp","/images/skins/terminus/24524":"webp","/images/skins/terminus/26925":"webp","/images/skins/terminus/30984":"webp","/images/skins/terminus/31121":"webp","/images/skins/tiberius/24885":"webp","/images/skins/tiberius/25183":"webp","/images/skins/tiberius/25184":"webp","/images/skins/tiberius/25185":"webp","/images/skins/tiberius/25210":"webp","/images/skins/tiberius/25416":"webp","/images/skins/tiberius/27168":"webp","/images/skins/tiberius/31146":"webp","/images/skins/tiberius/31151":"webp","/images/skins/torvald/15810":"webp","/images/skins/torvald/16294":"webp","/images/skins/torvald/16295":"webp","/images/skins/torvald/16296":"webp","/images/skins/torvald/19233":"webp","/images/skins/torvald/19283":"webp","/images/skins/torvald/19284":"webp","/images/skins/torvald/20069":"webp","/images/skins/torvald/23054":"webp","/images/skins/torvald/25472":"webp","/images/skins/torvald/26861":"webp","/images/skins/torvald/27500":"webp","/images/skins/tyra/10004":"webp","/images/skins/tyra/15822":"webp","/images/skins/tyra/16094":"webp","/images/skins/tyra/16095":"webp","/images/skins/tyra/16096":"webp","/images/skins/tyra/16571":"webp","/images/skins/tyra/18677":"webp","/images/skins/tyra/18678":"webp","/images/skins/tyra/19003":"webp","/images/skins/tyra/19882":"webp","/images/skins/tyra/20142":"webp","/images/skins/tyra/20423":"webp","/images/skins/tyra/23184":"webp","/images/skins/tyra/24006":"webp","/images/skins/tyra/24638":"webp","/images/skins/tyra/24980":"webp","/images/skins/tyra/25012":"webp","/images/skins/tyra/26651":"webp","/images/skins/tyra/26662":"webp","/images/skins/tyra/27739":"webp","/images/skins/tyra/27757":"webp","/images/skins/tyra/31566":"webp","/images/skins/tyra/31569":"webp","/images/skins/tyra/32829":"webp","/images/skins/tyra/32852":"webp","/images/skins/tyra/32963":"webp","/images/skins/tyra/33520":"webp","/images/skins/vatu/27178":"webp","/images/skins/vatu/27205":"webp","/images/skins/vatu/27206":"webp","/images/skins/vatu/27213":"webp","/images/skins/vatu/27307":"webp","/images/skins/vatu/31068":"webp","/images/skins/vii/27939":"webp","/images/skins/vii/27963":"webp","/images/skins/vii/27964":"webp","/images/skins/vii/27966":"webp","/images/skins/vii/27967":"webp","/images/skins/vii/27968":"webp","/images/skins/vii/28012":"webp","/images/skins/vii/29977":"webp","/images/skins/viktor/10001":"webp","/images/skins/viktor/14173":"webp","/images/skins/viktor/14477":"webp","/images/skins/viktor/14588":"webp","/images/skins/viktor/15177":"webp","/images/skins/viktor/15178":"webp","/images/skins/viktor/15179":"webp","/images/skins/viktor/15961":"webp","/images/skins/viktor/16308":"webp","/images/skins/viktor/16309":"webp","/images/skins/viktor/16310":"webp","/images/skins/viktor/16311":"webp","/images/skins/viktor/17103":"webp","/images/skins/viktor/17104":"webp","/images/skins/viktor/19259":"webp","/images/skins/viktor/22099":"webp","/images/skins/viktor/23055":"webp","/images/skins/viktor/23057":"webp","/images/skins/viktor/23608":"webp","/images/skins/viktor/23831":"webp","/images/skins/viktor/24015":"webp","/images/skins/viktor/25455":"webp","/images/skins/viktor/25457":"webp","/images/skins/viktor/27292":"webp","/images/skins/viktor/27945":"webp","/images/skins/viktor/32739":"webp","/images/skins/vivian/19707":"webp","/images/skins/vivian/20246":"webp","/images/skins/vivian/20252":"webp","/images/skins/vivian/20451":"webp","/images/skins/vivian/22051":"webp","/images/skins/vivian/23588":"webp","/images/skins/vivian/23755":"webp","/images/skins/vivian/24091":"webp","/images/skins/vivian/24353":"webp","/images/skins/vivian/26653":"webp","/images/skins/vivian/26658":"webp","/images/skins/vivian/27748":"webp","/images/skins/vivian/31780":"webp","/images/skins/vora/26316":"webp","/images/skins/vora/26317":"webp","/images/skins/vora/26330":"webp","/images/skins/vora/26332":"webp","/images/skins/vora/26334":"webp","/images/skins/vora/26339":"webp","/images/skins/vora/30925":"webp","/images/skins/vora/32331":"webp","/images/skins/vora/32338":"webp","/images/skins/willo/16810":"webp","/images/skins/willo/18311":"webp","/images/skins/willo/18312":"webp","/images/skins/willo/18313":"webp","/images/skins/willo/19128":"webp","/images/skins/willo/19129":"webp","/images/skins/willo/19245":"webp","/images/skins/willo/20424":"webp","/images/skins/willo/23056":"webp","/images/skins/willo/23882":"webp","/images/skins/willo/27940":"webp","/images/skins/willo/30838":"webp","/images/skins/willo/30986":"webp","/images/skins/yagorath/26522":"webp","/images/skins/yagorath/26833":"webp","/images/skins/yagorath/26834":"webp","/images/skins/yagorath/26921":"webp","/images/skins/yagorath/27741":"webp","/images/skins/yagorath/30988":"webp","/images/skins/ying/13212":"webp","/images/skins/ying/13502":"webp","/images/skins/ying/14215":"webp","/images/skins/ying/15433":"webp","/images/skins/ying/15434":"webp","/images/skins/ying/15867":"webp","/images/skins/ying/16220":"webp","/images/skins/ying/17096":"webp","/images/skins/ying/17097":"webp","/images/skins/ying/18559":"webp","/images/skins/ying/18656":"webp","/images/skins/ying/18728":"webp","/images/skins/ying/22062":"webp","/images/skins/ying/23713":"webp","/images/skins/ying/24286":"webp","/images/skins/ying/24589":"webp","/images/skins/ying/24826":"webp","/images/skins/ying/25156":"webp","/images/skins/ying/25265":"webp","/images/skins/ying/26917":"webp","/images/skins/ying/27010":"webp","/images/skins/ying/27219":"webp","/images/skins/ying/27900":"webp","/images/skins/ying/32741":"webp","/images/skins/zhin/18231":"webp","/images/skins/zhin/19083":"webp","/images/skins/zhin/19084":"webp","/images/skins/zhin/19085":"webp","/images/skins/zhin/19347":"webp","/images/skins/zhin/20204":"webp","/images/skins/zhin/22863":"webp","/images/skins/zhin/24092":"webp","/images/skins/zhin/26660":"webp","/images/skins/zhin/26674":"webp","/images/skins/zhin/27286":"webp","/images/skins/zhin/30982":"webp","/images/skins/zhin/31123":"webp","/images/skins/zhin/32357":"webp","/images/skins/zhin/33769":"webp","/images/wallpapers/paladins-ying-4k-0q":"jpg"}');
;// ./lib/image-assets.ts

/**
 * Next's production static-file handler does not resolve local image paths
 * containing commas, even when the file exists in the container. Asset names
 * are therefore published without commas; normalize legacy reference data at
 * the rendering boundary as well.
 * Returns: `string`
 * refs: none
 */
/**
 * Remove commas from local /images/ asset paths to match published filenames; leave other sources unchanged.
 * I/O types: `src: string -> string`.
 * refs: none
 */
function canonicalLocalImageUrl(src) {
    const boundary = src.search(/[?#]/);
    const path = boundary < 0 ? src : src.slice(0, boundary);
    const suffix = boundary < 0 ? "" : src.slice(boundary);
    return path.startsWith("/images/") ? path.replace(/,|%2c/gi, "") + suffix : src;
}
/**
 * Resolve local artwork to an AVIF-first source with a PNG compatibility
 * fallback (or the existing original representation). Remote, data, and blob URLs are left untouched because the site
 * does not own an alternate representation for them.
 * refs: none
 * I/O types: `src: string -> LocalImageSources`.
 */
function localImageSources(src) {
    const canonical = canonicalLocalImageUrl(src);
    if (!canonical.startsWith("/images/") && !canonical.startsWith("/drafts/")) {
        return { preferred: canonical, fallback: canonical };
    }
    // Motion and reduced-motion PNG selection remain owned by PlayerLoadingFrame.
    if (canonical.startsWith("/images/loading-frames/")) {
        return { preferred: canonical, fallback: canonical };
    }
    const boundary = canonical.search(/[?#]/);
    const pathname = boundary < 0 ? canonical : canonical.slice(0, boundary);
    const suffix = boundary < 0 ? "" : canonical.slice(boundary);
    const match = pathname.match(/^(.*)\.(?:avif|png|jpe?g|webp)$/i);
    if (!match)
        return { preferred: canonical, fallback: canonical };
    const stem = match[1];
    let key = stem;
    try {
        key = decodeURIComponent(stem);
    }
    catch { /* Preserve malformed input for the existing terminal handler. */ }
    const format = image_asset_fallbacks_namespaceObject[key] || "png";
    return {
        preferred: `${stem}.avif${suffix}`,
        fallback: `${stem}.${format}${suffix}`,
    };
}
/**
 * Return the AVIF-first local image source selected by localImageSources; external and unsupported sources pass through unchanged.
 * refs: none
 * I/O types: `src: string -> string`.
 */
function preferredLocalImageUrl(src) {
    return localImageSources(src).preferred;
}
/**
 * Return the original-format fallback selected by localImageSources; external and unsupported sources pass through unchanged.
 * refs: none
 * I/O types: `src: string -> string`.
 */
function fallbackLocalImageUrl(src) {
    return localImageSources(src).fallback;
}
/**
 * Champion data owns exact talent asset URLs. Never reconstruct a filename
 * refs: none
 * from API display text; punctuation, localization, and historic names differ.
 * I/O types: `source: string | null | undefined -> string | null`.
 */
function getCanonicalTalentImageUrl(source) {
    return source?.startsWith("/images/") ? preferredLocalImageUrl(source) : null;
}
/** Resolve the local item icon using the shared item artwork naming convention. */
function itemIconPath(name) {
    return `/images/items/${name.replace(/\s+/g, "_")}_Icon.avif`;
}

;// ./lib/image-dom.ts
/** Apply the shared AVIF/original policy to raw images without changing their layout. */

/** Install one shared policy per document; return its reference-counted cleanup. */
function installImageAssetPolicy(document) {
    const owner = document;
    if (owner.__paladinscatImagePolicy) {
        const current = owner.__paladinscatImagePolicy;
        current.references++;
        return () => { if (--current.references === 0)
            current.dispose(); };
    }
    const view = document.defaultView;
    if (!view)
        return () => { };
    let active = true;
    const selected = new WeakMap();
    const failed = new WeakMap();
    const failedBackgrounds = new Set();
    const probes = new Map(), cancelProbes = new Set();
    function local(raw) {
        try {
            const url = new URL(raw, document.baseURI);
            if (url.origin !== view.location.origin || !/^\/(?:images|drafts)\//.test(url.pathname)
                || url.pathname.startsWith("/images/loading-frames/"))
                return null;
            return localImageSources(url.pathname + url.search + url.hash);
        }
        catch {
            return null;
        }
    }
    function promote(image) {
        if (image.hasAttribute("data-pc-image-managed"))
            return;
        const raw = image.getAttribute("src") || "";
        if (!raw || selected.get(image) === raw)
            return;
        const sources = local(raw);
        if (!sources || sources.preferred === sources.fallback)
            return;
        const errors = failed.get(image);
        let preferred = sources.preferred;
        if (errors?.has(preferred))
            preferred = sources.fallback;
        if (errors?.has(preferred))
            return;
        selected.set(image, preferred);
        if (raw !== preferred)
            image.setAttribute("src", preferred);
    }
    function onError(event) {
        const image = event.target;
        if (image?.tagName !== "IMG" || image.hasAttribute("data-pc-image-managed"))
            return;
        const raw = image.currentSrc || image.getAttribute("src") || "", sources = local(raw);
        if (!sources)
            return;
        const errors = failed.get(image) || new Set();
        failed.set(image, errors);
        const current = new URL(raw, document.baseURI);
        const name = current.pathname + current.search + current.hash;
        errors.add(name);
        if (!/\.avif(?:[?#]|$)/i.test(name) || sources.fallback === sources.preferred || errors.has(sources.fallback))
            return;
        event.stopImmediatePropagation();
        selected.set(image, sources.fallback);
        image.removeAttribute("srcset");
        if (image.parentElement?.tagName === "PICTURE")
            image.parentElement.querySelectorAll("source").forEach(source => source.removeAttribute("srcset"));
        image.setAttribute("src", sources.fallback);
    }
    function probe(url) {
        let result = probes.get(url);
        if (result)
            return result;
        result = new Promise(resolve => {
            const image = document.createElement("img");
            const finish = (ok) => { if (!ok)
                failedBackgrounds.add(url); clearTimeout(timer); image.onload = image.onerror = null; cancelProbes.delete(cancel); resolve(ok); };
            const cancel = () => { finish(false); image.removeAttribute("src"); };
            const timer = view.setTimeout(() => { finish(false); image.removeAttribute("src"); }, 10000);
            cancelProbes.add(cancel);
            image.onload = () => finish(true);
            image.onerror = () => finish(false);
            image.src = url;
        });
        probes.set(url, result);
        return result;
    }
    function background(element) {
        const value = element.style.backgroundImage || (element === document.body ? view.getComputedStyle(element).backgroundImage : "");
        if (!value.includes("url("))
            return;
        const matches = [...value.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/g)];
        for (const match of matches) {
            const raw = (match[1] || match[2] || match[3] || "").trim(), sources = local(raw);
            if (!sources || sources.preferred === sources.fallback)
                continue;
            const preferred = failedBackgrounds.has(sources.preferred) ? sources.fallback : sources.preferred;
            const wanted = `url(${JSON.stringify(preferred)})`;
            const url = new URL(raw, document.baseURI);
            if (url.pathname + url.search + url.hash !== preferred)
                element.style.backgroundImage = value.replace(match[0], wanted);
            if (preferred === sources.fallback)
                continue;
            void probe(sources.preferred).then(ok => {
                if (!active || ok)
                    return;
                const current = element.style.backgroundImage || view.getComputedStyle(element).backgroundImage;
                const next = current.replaceAll(sources.preferred, sources.fallback).replaceAll(new URL(sources.preferred, document.baseURI).href, sources.fallback);
                if (next !== current)
                    element.style.backgroundImage = next;
            });
        }
    }
    function visit(node) {
        if (node.tagName === "IMG")
            promote(node);
        node.querySelectorAll("img").forEach(promote);
        if (node.style?.backgroundImage || node === document.body)
            background(node);
        node.querySelectorAll('[style*="url("]').forEach(background);
    }
    const observer = new MutationObserver(records => {
        for (const record of records) {
            if (record.type === "attributes") {
                const target = record.target;
                if (target.tagName === "IMG")
                    promote(target);
                if (record.attributeName === "style")
                    background(target);
            }
            else
                for (const node of record.addedNodes)
                    if (node.nodeType === 1)
                        visit(node);
        }
    });
    view.addEventListener("error", onError, true);
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["src", "srcset", "style"] });
    visit(document.documentElement);
    background(document.body);
    const installation = { references: 1, dispose() {
            if (!active)
                return;
            active = false;
            observer.disconnect();
            view.removeEventListener("error", onError, true);
            for (const cancel of [...cancelProbes])
                cancel();
            probes.clear();
            delete owner.__paladinscatImagePolicy;
        } };
    owner.__paladinscatImagePolicy = installation;
    return () => { if (--installation.references === 0)
        installation.dispose(); };
}

;// ./scripts/discovery-images/entry.ts


const dispose = installImageAssetPolicy(document);
Object.assign(window, { DiscoveryImages: { sources: localImageSources } });
window.addEventListener("pagehide", event => { if (!event.persisted)
    dispose(); });

/******/ })()
;