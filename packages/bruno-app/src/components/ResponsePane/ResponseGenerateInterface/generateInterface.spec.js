const { describe, expect, it } = require('@jest/globals');

import { generateResponseModel } from './generateInterface';

describe('generateResponseModel', () => {
  const responseData = {
    data: {
      total: 1,
      results: [
        {
          id: 1,
          profile: {
            firstName: 'Ada',
            address: {
              city: 'London'
            }
          }
        }
      ]
    }
  };

  it('uses the response entity when naming nested TypeScript interfaces', () => {
    const code = generateResponseModel(
      responseData,
      'typescript',
      'GetUsersResponse'
    );

    expect(code).toContain('export interface UsersProfileAddress');
    expect(code).toContain('export interface UsersProfile');
    expect(code).toContain('export interface Users');
    expect(code).toContain('export interface UsersData');
    expect(code).toContain('results: Users[];');
    expect(code).toContain('profile: UsersProfile;');
    expect(code).not.toContain('GetUsersResponseDataResultProfileAddress');
    expect(code).not.toContain('export interface Data');
    expect(code).not.toContain('export interface Results');
  });

  it('uses the response entity when naming nested Dart classes', () => {
    const code = generateResponseModel(
      responseData,
      'dart',
      'GetUsersResponse'
    );

    expect(code).toContain('class UsersProfileAddress');
    expect(code).toContain('class UsersProfile');
    expect(code).toContain('class Users');
    expect(code).toContain('class UsersData');
    expect(code).toContain('final List<Users> results;');
    expect(code).toContain('final UsersProfile profile;');
    expect(code).not.toContain('class GetUsersResponseDataResultProfileAddress');
    expect(code).not.toContain('class Data');
    expect(code).not.toContain('class Results');
  });
});
