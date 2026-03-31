package File::Which;

use strict;
use warnings;
use Exporter   ();
use File::Spec ();

# ABSTRACT: Perl implementation of the which utility as an API
our $VERSION = '1.23'; # VERSION


our @ISA       = 'Exporter';
our @EXPORT    = 'which';
our @EXPORT_OK = 'where';

use constant IS_VMS => ($^O eq 'VMS');
use constant IS_MAC => ($^O eq 'MacOS');
use constant IS_WIN => ($^O eq 'MSWin32' or $^O eq 'dos' or $^O eq 'os2');
use constant IS_DOS => IS_WIN();
use constant IS_CYG => ($^O eq 'cygwin' || $^O eq 'msys');

our $IMPLICIT_CURRENT_DIR = IS_WIN || IS_VMS || IS_MAC;

# For Win32 systems, stores the extensions used for
# executable files
# For others, the empty string is used
# because 'perl' . '' eq 'perl' => easier
my @PATHEXT = ('');
if ( IS_WIN ) {
  # WinNT. PATHEXT might be set on Cygwin, but not used.
  if ( $ENV{PATHEXT} ) {
    push @PATHEXT, split ';', $ENV{PATHEXT};
  } else {
    # Win9X or other: doesn't have PATHEXT, so needs hardcoded.
    push @PATHEXT, qw{.com .exe .bat};
  }
} elsif ( IS_VMS ) {
  push @PATHEXT, qw{.exe .com};
} elsif ( IS_CYG ) {
  # See this for more info
  # http://cygwin.com/cygwin-ug-net/using-specialnames.html#pathnames-exe
  push @PATHEXT, qw{.exe .com};
}


sub which {
  my ($exec) = @_;

  return undef unless defined $exec;
  return undef if $exec eq '';

  my $all = wantarray;
  my @results = ();

  # check for aliases first
  if ( IS_VMS ) {
    my $symbol = `SHOW SYMBOL $exec`;
    chomp($symbol);
    unless ( $? ) {
      return $symbol unless $all;
      push @results, $symbol;
    }
  }
  if ( IS_MAC ) {
    my @aliases = split /\,/, $ENV{Aliases};
    foreach my $alias ( @aliases ) {
      # This has not been tested!!
      # PPT which says MPW-Perl cannot resolve `Alias $alias`,
      # let's just hope it's fixed
      if ( lc($alias) eq lc($exec) ) {
        chomp(my $file = `Alias $alias`);
        last unless $file;  # if it failed, just go on the normal way
        return $file unless $all;
        push @results, $file;
        # we can stop this loop as if it finds more aliases matching,
        # it'll just be the same result anyway
        last;
      }
    }
  }

  return $exec
          if !IS_VMS and !IS_MAC and !IS_WIN and $exec =~ /\// and -f $exec and -x $exec;

  my @path;
  if($^O eq 'MSWin32') {
    # File::Spec (at least recent versions)
    # add the implicit . for you on MSWin32,
    # but we may or may not want to include
    # that.
    @path = split(';', $ENV{PATH});
    s/"//g for @path;
    @path = grep length, @path;
  } else {
    @path = File::Spec->path;
  }
  if ( $IMPLICIT_CURRENT_DIR ) {
    unshift @path, File::Spec->curdir;
  }

  foreach my $base ( map { File::Spec->catfile($_, $exec) } @path ) {
    for my $ext ( @PATHEXT ) {
      my $file = $base.$ext;

      # We don't want dirs (as they are -x)
      next if -d $file;

      if (
        # Executable, normal case
        -x _
        or (
          # MacOS doesn't mark as executable so we check -e
          IS_MAC
          ||
          (
            ( IS_WIN or IS_CYG )
            and
            grep {
              $file =~ /$_\z/i
            } @PATHEXT[1..$#PATHEXT]
          )
          # DOSish systems don't pass -x on
          # non-exe/bat/com files. so we check -e.
          # However, we don't want to pass -e on files
          # that aren't in PATHEXT, like README.
          and -e _
        )
      ) {
        return $file unless $all;
        push @results, $file;
      }
    }
  }

  if ( $all ) {
    return @results;
  } else {
    return undef;
  }
}


sub where {
  # force wantarray
  my @res = which($_[0]);
  return @res;
}

1;

__END__

=pod

=encoding UTF-8

=head1 NAME

File::Which - Perl implementation of the which utility as an API

=head1 VERSION

version 1.23

=head1 SYNOPSIS

 use File::Which;                  # exports which()
 use File::Which qw(which where);  # exports which() and where()
 
 my $exe_path = which 'perldoc';
 
 my @paths = where 'perl';
 # Or
 my @paths = which 'perl'; # an array forces search for all of them

=head1 DESCRIPTION

L<File::Which> finds the full or relative paths to executable programs on
the system.  This is normally the function of C<which> utility.  C<which> is
typically implemented as either a program or a built in shell command.  On
some platforms, such as Microsoft Windows it is not provided as part of the
core operating system.  This module provides a consistent API to this
functionality regardless of the underlying platform.

The focus of this module is correctness and portability.  As a consequence
platforms where the current directory is implicitly part of the search path
such as Microsoft Windows will find executables in the current directory,
whereas on platforms such as UNIX where this is not the case executables
in the current directory will only be found if the current directory is
explicitly added to the path.

If you need a portable C<which> on the command line in an environment that
does not provide it, install L<App::pwhich> which provides a command line
interface to this API.

=head2 Implementations

L<File::Which> searches the directories of the user's C<PATH> (the current
implementation uses L<File::Spec#path> to determine the correct C<PATH>),
looking for executable files having the name specified as a parameter to
L</which>. Under Win32 systems, which do not have a notion of directly
executable files, but uses special extensions such as C<.exe> and C<.bat>
to identify them, C<File::Which> takes extra steps to assure that
you will find the correct file (so for example, you might be searching for
C<perl>, it'll try F<perl.exe>, F<perl.bat>, etc.)

=head3 Linux, *BSD and other UNIXes

There should not be any surprises here.  The current directory will not be
searched unless it is explicitly added to the path.

=head3 Modern Windows (including NT, XP, Vista, 7, 8, 10 etc)

Windows NT has a special environment variable called C<PATHEXT>, which is used
by the shell to look for executable files. Usually, it will contain a list in
the form C<.EXE;.BAT;.COM;.JS;.VBS> etc. If C<File::Which> finds such an
environment variable, it parses the list and uses it as the different
extensions.

=head3 Cygwin

Cygwin provides a Unix-like environment for Microsoft Windows users.  In most
ways it works like other Unix and Unix-like environments, but in a few key
aspects it works like Windows.  As with other Unix environments, the current
directory is not included in the search unless it is explicitly included in
the search path.  Like on Windows, files with C<.EXE> or <.BAT> extensions will
be discovered even if they are not part of the query.  C<.COM> or extensions
specified using the C<PATHEXT> environment variable will NOT be discovered
without the fully qualified name, however.

=head3 Windows ME, 98, 95, MS-DOS, OS/2

This set of operating systems don't have the C<PATHEXT> variable, and usually
you will find executable files there with the extensions C<.exe>, C<.bat> and
(less likely) C<.com>. C<File::Which> uses this hardcoded list if it's running
under Win32 but does not find a C<PATHEXT> variable.

As of 2015 none of these platforms are tested frequently (or perhaps ever),
but the current maintainer is determined not to intentionally remove support
for older operating systems.

=head3 VMS

Same case as Windows 9x: uses C<.exe> and C<.com> (in that order).

As of 2015 the current maintainer does not test on VMS, and is in fact not
certain it has ever been tested on VMS.  If this platform is important to you
and you can help me verify and or support it on that platform please contact
me.

=head1 FUNCTIONS

=head2 which

 my $path = which $short_exe_name;
 my @paths = which $short_exe_name;

Exported by default.

C<$short_exe_name> is the name used in the shell to call the program (for
example, C<perl>).

If it finds an executable with the name you specified, C<which()> will return
the absolute path leading to this executable (for example, F</usr/bin/perl> or
F<C:\Perl\Bin\perl.exe>).

If it does I<not> find the executable, it returns C<undef>.

If C<which()> is called in list context, it will return I<all> the
matches.

=head2 where

 my @paths = where $short_exe_name;

Not exported by default.

Same as L</which> in array context.  Similar to the C<where> csh
built-in command or C<which -a> command for platforms that support the
C<-a> option. Will return an array containing all the path names
matching C<$short_exe_name>.

=head1 GLOBALS

=head2 $IMPLICIT_CURRENT_DIR

True if the current directory is included in the search implicitly on
whatever platform you are using.  Normally the default is reasonable,
but on Windows the current directory is included implicitly for older
shells like C<cmd.exe> and C<command.com>, but not for newer shells
like PowerShell.  If you overrule this default, you should ALWAYS
localize the variable to the tightest scope possible, since setting
this variable from a module can affect other modules.  Thus on Windows
you can get the correct result if the user is running either C<cmd.exe>
or PowerShell on Windows you can do this:

 use File::Which qw( which );
 use Shell::Guess;

 my $path = do {
   my $is_power = Shell::Guess->running_shell->is_power;
   local $File::Which::IMPLICIT_CURRENT_DIR = !$is_power;
   which 'foo';
 };

For a variety of reasons it is difficult to accurately compute the
shell that a user is using, but L<Shell::Guess> makes a reasonable
effort.

=head1 CAVEATS

This module has no non-core requirements for Perl 5.6.2 and better.

This module is fully supported back to Perl 5.8.1.  It may work on 5.8.0.
It should work on Perl 5.6.x and I may even test on 5.6.2.  I will accept
patches to maintain compatibility for such older Perls, but you may
need to fix it on 5.6.x / 5.8.0 and send me a patch.

Not tested on VMS although there is platform specific code
for those. Anyone who haves a second would be very kind to send me a
report of how it went.

=head1 SUPPORT

Bugs should be reported via the GitHub issue tracker

L<https://github.com/plicease/File-Which/issues>

For other issues, contact the maintainer.

=head1 SEE ALSO

=over 4

=item L<pwhich>, L<App::pwhich>

Command line interface to this module.

=item L<IPC::Cmd>

This module provides (among other things) a C<can_run> function, which is
similar to C<which>.  It is a much heavier module since it does a lot more,
and if you use C<can_run> it pulls in L<ExtUtils::MakeMaker>.  This combination
may be overkill for applications which do not need L<IPC::Cmd>'s complicated
interface for running programs, or do not need the memory overhead required
for installing Perl modules.

At least some older versions will find executables in the current directory,
even if the current directory is not in the search path (which is the default
on modern Unix).

C<can_run> converts directory path name to the 8.3 version on Windows using
C<Win32::GetShortPathName> in some cases.  This is frequently useful for tools
that just need to run something using C<system> in scalar mode, but may be
inconvenient for tools like L<App::pwhich> where user readability is a premium.
Relying on C<Win32::GetShortPathName> to produce filenames without spaces
is problematic, as 8.3 filenames can be turned off with tweaks to the
registry (see L<https://technet.microsoft.com/en-us/library/cc959352.aspx>).

=item L<Devel::CheckBin>

This module purports to "check that a command is available", but does not
provide any documentation on how you might use it.

=back

=head1 AUTHORS

=over 4

=item *

Per Einar Ellefsen <pereinar@cpan.org>

=item *

Adam Kennedy <adamk@cpan.org>

=item *

Graham Ollis <plicease@cpan.org>

=back

=head1 COPYRIGHT AND LICENSE

This software is copyright (c) 2002 by Per Einar Ellefsen <pereinar@cpan.org>.

This is free software; you can redistribute it and/or modify it under
the same terms as the Perl 5 programming language system itself.

=cut
