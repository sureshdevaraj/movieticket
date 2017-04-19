call npm config set proxy http://fdcproxy.verizon.com:80
call npm config set https-proxy http://fdcproxy.verizon.com:80
call npm install forever -g
call npm install

mkdir d:\mw
mklink /D d:\mw\npm %AppData%\npm
mklink /D d:\mw\npm-cache %AppData%\npm-cache

Set PATH=%PATH%;d:\mw\npm
cd /d d:\app\vzbot

Set PATH=%PATH%;%userprofile%\appdata\Roaming\npm

forever -s start src/app.js