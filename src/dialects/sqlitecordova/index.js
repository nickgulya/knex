/* globals openDatabase:false */

// WebSQL
// -------
import inherits from 'inherits';

import Transaction from './transaction';
import Client_SQLite3 from '../sqlite3';
import Promise from 'bluebird';
import { assign, map, uniqueId, clone } from 'lodash'

function Client_SQLCordova(config) {
    Client_SQLite3.call(this, config);
    this.name = config.name || 'knex_database.db';
    this.version = config.version || '1.0';
    this.key = config.key || 'defaut_key';
    this.displayName = config.displayName || this.name;
    this.estimatedSize = config.estimatedSize || 5 * 1024 * 1024;
}
inherits(Client_SQLCordova, Client_SQLite3);

assign(Client_SQLCordova.prototype, {

    transaction() {
        return new Transaction(this, ...arguments)
    },

    dialect: 'sqlitecordova',

    // Get a raw connection from the database, returning a promise with the connection object.
    acquireConnection() {
        const client = this;
        return new Promise(function(resolve, reject) {
            try {
                /*jslint browser: true*/
                const db = window.sqlitePlugin.openDatabase({name: client.name, key: client.key, location: 'default', androidLockWorkaround: 1},
                    function(sucess) {
                        //console.log('Connection DB sucess');
                    },
                    function(err) {
                        if (err) {
                            return reject(err)
                        }
                        resolve(db)
                    });
                db.transaction(function(t) {
                    t.__knexUid = uniqueId('__knexUid');
                    resolve(t);
                });
            } catch (e) {
                reject(e);
            }
        });
    },

    // Used to explicitly close a connection, called internally by the pool
    // when a connection times out or the pool is shutdown.
    releaseConnection() {
        return Promise.resolve()
    },

    // Runs the query on the specified connection,
    // providing the bindings and any other necessary prep work.
    _query(connection, obj) {
        return new Promise((resolver, rejecter) => {
            if (!connection) return rejecter(new Error('No connection provided.'));
            connection.executeSql(obj.sql, obj.bindings, (trx, response) => {
                obj.response = response;
                return resolver(obj);
            }, (trx, err) => {
                rejecter(err);
            });
        });
    },

    _stream(connection, sql, stream) {
        const client = this;
        return new Promise(function(resolver, rejecter) {
            stream.on('error', rejecter)
            stream.on('end', resolver)
            return client._query(connection, sql).then(obj =>
                client.processResponse(obj)
            ).map(row => {
                stream.write(row)
            }).catch(err => {
                stream.emit('error', err)
            }).then(() => {
                stream.end()
            })
        })
    },

    processResponse(obj, runner) {
        const resp = obj.response;
        if (obj.output) return obj.output.call(runner, resp);
        switch (obj.method) {
            case 'pluck':
            case 'first':
            case 'select': {
                let results = [];
                for (let i = 0, l = resp.rows.length; i < l; i++) {
                    results[i] = clone(resp.rows.item(i));
                }
                if (obj.method === 'pluck') results = map(results, obj.pluck);
                return obj.method === 'first' ? results[0] : results;
            }
            case 'insert':
                return [resp.insertId];
            case 'delete':
            case 'update':
            case 'counter':
                return resp.rowsAffected;
            default:
                return resp;
        }
    }

})

export default Client_SQLCordova;
