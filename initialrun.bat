Set PATH=%PATH%;%userprofile%\appdata\Roaming\npm
call npm config set proxy http://fdcproxy.verizon.com:80
call npm config set https-proxy http://fdcproxy.verizon.com:80
call npm install forever -g
call npm install