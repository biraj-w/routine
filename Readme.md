cd backend

npm init -y

npm install bcrypt cors dotenv express jsonwebtoken mysql2 sequelize

Explanation of dependencies:
express → Server framework
sequelize → ORM for MySQL
mysql2 → MySQL driver
dotenv → Load environment variables
jsonwebtoken → JWT authentication
bcrypt → Password hashing
cors → Enable Cross-Origin Resource Sharing

npm install --save-dev nodemon

npm run dev



## Step 1: Download & Install MySQL

1. Go to (https://dev.mysql.com/downloads/installer/).
2. Download the Windows (x86, 32-bit), MSI Installer	8.0.45	556.0M	
3. Run the installer and choose the setup type:
   Developer Default – includes MySQL Server, Workbench, Shell, Sample DBs, etc.
4. During installation:
    Set root password (remember it).
    Optionally, create additional MySQL users.
5. Complete the installation and launch MySQL Workbench.


## Step 2: Configure MySQL Server

1. Open MySQL Workbench.
2. Click on + to add a new connection:

   Connection Name: `Local MySQL` (or any name)
   Username: `root` (or your created user)
   Password: Click Store in Vault… and enter your password.
3. Test the connection → it should say Successfully made the MySQL connection.
4. Note your connection details:

   Host: `localhost`
   Port: `3306` (default)
   User: `root` (or other user)
   Password: as set
5. Create a database for your Node.js project:
   ```sql
   CREATE DATABASE my_project_db;
   ```


