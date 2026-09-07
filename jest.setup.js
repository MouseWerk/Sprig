// AsyncStorage is a native module; Storage.ts pulls it in through Database.ts
// even though the pure helpers under test never touch it. The package ships an
// in-memory mock exactly for this.
jest.mock('@react-native-async-storage/async-storage', () =>
    require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
