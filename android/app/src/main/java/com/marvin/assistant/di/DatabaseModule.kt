package com.marvin.assistant.di

import android.content.Context
import androidx.room.Room
import com.marvin.assistant.data.local.MarvinDatabase
import com.marvin.assistant.data.local.MessageDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): MarvinDatabase {
        return Room.databaseBuilder(
            context,
            MarvinDatabase::class.java,
            "marvin_database"
        ).build()
    }

    @Provides
    @Singleton
    fun provideMessageDao(database: MarvinDatabase): MessageDao {
        return database.messageDao()
    }
}
